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

/**
 * Cache hint for everything this server lists or reads. Content only changes
 * on redeploy, so clients (and shared caches) may reuse results briefly
 * (protocol revision 2026-07-28, SEP-2549). Legacy responses are unaffected.
 */
const CACHE_HINT = { ttlMs: 5 * 60 * 1000, cacheScope: 'public' } satisfies CacheHint;

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
 * (initialize handshake) from the same endpoint via the SDK's stateless
 * legacy fallback.
 */
export class McpDocsServer {
  private config: McpServerConfig;
  private searchProvider: SearchProvider | null = null;
  private skills: SkillsArtifact | null = null;
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
    const skills = this.skills?.skills.length ? this.skills : null;

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
          return {
            content: [{ type: 'text' as const, text: 'Server not initialized. Please try again.' }],
            isError: true,
          };
        }

        try {
          const results = await this.searchProvider.search(query, { limit });
          return {
            content: [{ type: 'text' as const, text: formatSearchResults(results) }],
          };
        } catch (error) {
          console.error('[MCP] Search error:', error);
          return {
            content: [
              {
                type: 'text' as const,
                text: 'An error occurred while searching. Please try again.',
              },
            ],
            isError: true,
          };
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
          return {
            content: [{ type: 'text' as const, text: 'Server not initialized. Please try again.' }],
            isError: true,
          };
        }

        try {
          const doc = await this.getDocument(url);
          return {
            content: [{ type: 'text' as const, text: formatPageContent(doc) }],
          };
        } catch (error) {
          console.error('[MCP] Fetch error:', error);
          return {
            content: [
              {
                type: 'text' as const,
                text: 'An error occurred while fetching the page. Please try again.',
              },
            ],
            isError: true,
          };
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
    const searchSpecifier = this.config.search ?? 'flexsearch';
    this.searchProvider = await loadSearchProvider(searchSpecifier, {
      flexsearch: this.config.flexsearch,
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
      this.skills = this.config.skills ?? null;
    } else if (isFileConfig(this.config)) {
      // File-based mode (Node.js)
      initData.docsPath = this.config.docsPath;
      initData.indexPath = this.config.indexPath;
      if (this.config.skillsPath) {
        const { readFile } = await import('node:fs/promises');
        this.skills = JSON.parse(await readFile(this.config.skillsPath, 'utf8')) as SkillsArtifact;
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
      skillCount: this.skills?.skills.length ?? 0,
      baseUrl: this.config.baseUrl,
      searchProvider: this.searchProvider?.name,
    };
  }
}

/**
 * Build a web-standard Request from a Node request. When the body was
 * already parsed it's re-serialized; otherwise the raw stream is forwarded.
 */
function toWebRequest(req: IncomingMessage, parsedBody: unknown): Request {
  const host = req.headers.host ?? 'localhost';
  const url = new URL(req.url ?? '/', `http://${host}`);

  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) {
      for (const v of value) headers.append(key, v);
    } else {
      headers.set(key, value);
    }
  }

  const method = req.method ?? 'GET';
  const hasBody = method !== 'GET' && method !== 'HEAD';

  if (!hasBody) {
    return new Request(url, { method, headers });
  }

  if (parsedBody !== undefined) {
    headers.delete('content-length');
    return new Request(url, { method, headers, body: JSON.stringify(parsedBody) });
  }

  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      for await (const chunk of req) {
        controller.enqueue(typeof chunk === 'string' ? new TextEncoder().encode(chunk) : chunk);
      }
      controller.close();
    },
  });

  return new Request(url, {
    method,
    headers,
    body,
    // Required by Node's fetch implementation for streaming request bodies.
    duplex: 'half',
  } as RequestInit);
}

/**
 * Write a web-standard Response to a Node ServerResponse, preserving any
 * headers already set on `res` (e.g. CORS).
 */
async function writeWebResponse(response: Response, res: ServerResponse): Promise<void> {
  response.headers.forEach((value, key) => {
    res.setHeader(key, value);
  });
  res.writeHead(response.status, response.statusText);

  if (!response.body) {
    res.end();
    return;
  }

  const reader = response.body.getReader();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      res.write(value);
    }
  } finally {
    res.end();
  }
}
