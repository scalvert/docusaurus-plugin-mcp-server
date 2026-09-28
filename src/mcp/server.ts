import {
  McpServer,
  WebStandardStreamableHTTPServerTransport,
  createMcpHandler,
  isLegacyRequest,
  type CacheHint,
  type McpHandlerRequestOptions,
  type McpHttpHandler,
} from '@modelcontextprotocol/server';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type {
  ProcessedDoc,
  McpServerConfig,
  McpServerFileConfig,
  McpServerDataConfig,
  SkillsArtifact,
} from '../types/index.js';
import { loadSearchProvider } from '../providers/loader.js';
import type {
  SearchProvider,
  ProviderContext,
  SearchProviderInitData,
} from '../providers/types.js';
import { docsSearchTool, formatSearchResults } from './tools/docs-search.js';
import { docsFetchTool, formatPageContent } from './tools/docs-fetch.js';
import { registerSkills, skillsCapabilities, skillsInstructions } from './skills.js';
// The bridge lives with the adapters but is a dependency of handleHttpRequest,
// which predates the web handler and stays part of this class's public API.
import { toWebRequest, writeWebResponse } from '../adapters/node-bridge.js';

/**
 * Cache hint for everything this server lists or reads. Content only changes
 * on redeploy, so clients (and shared caches) may reuse results briefly
 * (protocol revision 2026-07-28, SEP-2549). Legacy responses are unaffected.
 */
const CACHE_HINT: Required<CacheHint> = { ttlMs: 5 * 60 * 1000, cacheScope: 'public' };

/** A successful single-text-block tool result */
function toolText(text: string) {
  return { content: [{ type: 'text' as const, text }] };
}

/** A tool-level error result (the call reached the tool but failed) */
function toolError(text: string) {
  return { ...toolText(text), isError: true };
}

/**
 * Type guard to check if config uses file-based loading
 */
function isFileConfig(config: McpServerConfig): config is McpServerFileConfig {
  return 'docsPath' in config && 'indexPath' in config;
}

/**
 * Type guard to check if config uses pre-loaded data
 */
function isDataConfig(config: McpServerConfig): config is McpServerDataConfig {
  return 'docs' in config && 'searchIndexData' in config;
}

/**
 * MCP Server for documentation
 *
 * This class provides the MCP server implementation that can be used
 * with any HTTP framework (Express, Vercel, Cloudflare Workers, etc.)
 *
 * Supports two modes:
 * - File-based: Load docs and search index from filesystem (Node.js)
 * - Pre-loaded: Accept docs and search index data directly (Workers)
 *
 * Serves MCP protocol revision 2026-07-28 statelessly, and 2025-era clients
 * (initialize handshake) from the same endpoint through a stateless
 * JSON-response transport, so their responses match 1.x (see dispatch).
 */
export class McpDocsServer {
  private config: McpServerConfig;
  private searchProvider: SearchProvider | null = null;
  private skillsArtifact: SkillsArtifact | null = null;
  private handler: McpHttpHandler | null = null;
  private initialized = false;
  private initPromise: Promise<void> | null = null;
  private initError: Error | null = null;

  constructor(config: McpServerConfig) {
    this.config = config;
  }

  /**
   * Create a fresh McpServer instance with tools (and skills) registered.
   * Called by the SDK once per HTTP request.
   */
  private createMcpServer(): McpServer {
    const skills = this.skillsArtifact?.skills.length ? this.skillsArtifact : null;

    const instructions = [this.config.instructions, skills && skillsInstructions(skills.skills)]
      .filter(Boolean)
      .join('\n\n');

    const server = new McpServer(
      {
        name: this.config.name,
        version: this.config.version ?? '1.0.0',
      },
      {
        capabilities: {
          tools: { listChanged: false },
          ...(skills ? skillsCapabilities() : {}),
        },
        instructions: instructions || undefined,
        cacheHints: {
          'server/discover': CACHE_HINT,
          'tools/list': CACHE_HINT,
          'resources/list': CACHE_HINT,
          'resources/templates/list': CACHE_HINT,
          'resources/read': CACHE_HINT,
        },
      }
    );

    this.registerTools(server);
    if (skills) {
      registerSkills(server, skills, { cacheHint: CACHE_HINT });
    }
    return server;
  }

  /**
   * Register all MCP tools using definitions from tool files
   */
  private registerTools(server: McpServer): void {
    const toolOverrides = this.config.tools;

    server.registerTool(
      docsSearchTool.name,
      {
        description: toolOverrides?.docs_search?.description ?? docsSearchTool.description,
        inputSchema: docsSearchTool.inputSchema,
        annotations: { readOnlyHint: true, openWorldHint: false },
      },
      async ({ query, limit }) => {
        if (!this.searchProvider || !this.searchProvider.isReady()) {
          return toolError('Server not initialized. Please try again.');
        }

        try {
          const results = await this.searchProvider.search(query, { limit });
          return toolText(formatSearchResults(results));
        } catch (error) {
          console.error('[MCP] Search error:', error);
          return toolError('An error occurred while searching. Please try again.');
        }
      }
    );

    server.registerTool(
      docsFetchTool.name,
      {
        description: toolOverrides?.docs_fetch?.description ?? docsFetchTool.description,
        inputSchema: docsFetchTool.inputSchema,
        annotations: { readOnlyHint: true, openWorldHint: false },
      },
      async ({ url }) => {
        if (!this.searchProvider || !this.searchProvider.isReady()) {
          return toolError('Server not initialized. Please try again.');
        }

        try {
          const doc = await this.getDocument(url);
          return toolText(formatPageContent(doc));
        } catch (error) {
          console.error('[MCP] Fetch error:', error);
          return toolError('An error occurred while fetching the page. Please try again.');
        }
      }
    );
  }

  /**
   * Get a document by URL using the search provider
   */
  private async getDocument(url: string): Promise<ProcessedDoc | null> {
    if (!this.searchProvider) {
      return null;
    }

    if (this.searchProvider.getDocument) {
      return this.searchProvider.getDocument(url);
    }

    return null;
  }

  /**
   * Load docs and search index using the configured search provider
   *
   * For file-based config: reads from disk
   * For data config: uses pre-loaded data directly
   *
   * Uses promise-based locking to prevent concurrent initialization.
   * Caches initialization errors so repeated calls fail fast.
   */
  async initialize(): Promise<void> {
    if (this.initError) {
      throw this.initError;
    }

    if (this.initialized) {
      return;
    }

    if (!this.initPromise) {
      this.initPromise = this._doInitialize().catch((error) => {
        this.initError = error instanceof Error ? error : new Error(String(error));
        this.initPromise = null;
        throw this.initError;
      });
    }

    return this.initPromise;
  }

  private async _doInitialize(): Promise<void> {
    if ('flexsearch' in this.config) {
      throw new Error(
        "[MCP] The 'flexsearch' server option was removed in docusaurus-plugin-mcp-server 2.0. " +
          'Remove it; use \'localSearch\' to set field boosts. See "Upgrading to 2.0" in the README.'
      );
    }
    const searchSpecifier = this.config.search ?? 'local';
    this.searchProvider = await loadSearchProvider(searchSpecifier, {
      localSearch: this.config.localSearch,
    });

    const providerContext: ProviderContext = {
      baseUrl: this.config.baseUrl ?? '',
      serverName: this.config.name,
      serverVersion: this.config.version ?? '1.0.0',
      outputDir: '', // Not relevant for runtime
    };

    // Build init data based on config type
    const initData: SearchProviderInitData = {};

    if (isDataConfig(this.config)) {
      // Pre-loaded data mode (Cloudflare Workers, etc.)
      initData.docs = this.config.docs;
      initData.indexData = this.config.searchIndexData;
      this.skillsArtifact = this.config.skills ?? null;
    } else if (isFileConfig(this.config)) {
      // File-based mode (Node.js)
      initData.docsPath = this.config.docsPath;
      initData.indexPath = this.config.indexPath;
      if (this.config.skillsPath) {
        const { readFile } = await import('node:fs/promises');
        this.skillsArtifact = JSON.parse(
          await readFile(this.config.skillsPath, 'utf8')
        ) as SkillsArtifact;
      }
    } else {
      throw new Error('Invalid server config: must provide either file paths or pre-loaded data');
    }

    await this.searchProvider.initialize(providerContext, initData);

    this.handler = createMcpHandler(() => this.createMcpServer(), {
      // Legacy traffic is routed separately (see dispatch) to keep v1's JSON responses.
      legacy: 'reject',
      // Default 'auto' mode answers with a single JSON body unless a handler
      // emits a notification first; our tools never do.
      onerror: (error) => console.error('[MCP] Handler error:', error),
    });

    this.initialized = true;
  }

  /**
   * Route one request by protocol era. 2026-07-28 requests go to the SDK's
   * modern handler. 2025-era requests (initialize handshake, no per-request
   * envelope) get a fresh stateless server over a JSON-response transport,
   * matching the wire behavior of v1 of this package.
   */
  private async dispatch(request: Request, options?: McpHandlerRequestOptions): Promise<Response> {
    await this.initialize();
    if (!this.handler) {
      throw new Error('MCP handler not initialized');
    }

    if (!(await isLegacyRequest(request, options?.parsedBody))) {
      return this.handler.fetch(request, options);
    }

    const server = this.createMcpServer();
    const transport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });
    await server.connect(transport);
    try {
      return await transport.handleRequest(request, options);
    } finally {
      await transport.close();
    }
  }

  /**
   * Handle a Node.js HTTP request.
   *
   * Bridges the Node request/response pair onto the web-standard handler.
   * Pass `parsedBody` when the body has already been consumed (e.g. by a
   * body-parsing middleware).
   *
   * @param req - Node.js IncomingMessage or compatible request object
   * @param res - Node.js ServerResponse or compatible response object
   * @param parsedBody - Optional pre-parsed request body
   */
  async handleHttpRequest(
    req: IncomingMessage,
    res: ServerResponse,
    parsedBody?: unknown
  ): Promise<void> {
    const request = toWebRequest(req, parsedBody);
    const response = await this.dispatch(
      request,
      parsedBody !== undefined ? { parsedBody } : undefined
    );
    await writeWebResponse(response, res);
  }

  /**
   * Handle a Web Standard Request (Cloudflare Workers, Deno, Bun)
   *
   * @param request - Web Standard Request object
   * @returns Web Standard Response object
   */
  async handleWebRequest(request: Request): Promise<Response> {
    return this.dispatch(request);
  }

  /**
   * Get server status information
   *
   * Useful for health checks and debugging
   */
  async getStatus(): Promise<{
    name: string;
    version: string;
    initialized: boolean;
    docCount: number;
    skillCount: number;
    baseUrl?: string;
    searchProvider?: string;
  }> {
    let docCount = 0;

    if (this.searchProvider?.getDocCount) {
      docCount = this.searchProvider.getDocCount();
    }

    return {
      name: this.config.name,
      version: this.config.version ?? '1.0.0',
      initialized: this.initialized,
      docCount,
      skillCount: this.skillsArtifact?.skills.length ?? 0,
      baseUrl: this.config.baseUrl,
      searchProvider: this.searchProvider?.name,
    };
  }
}
