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
  McpServerBaseConfig,
  McpServerBundleConfig,
  McpDocsServerConfig,
  McpServerFileConfig,
  McpServerDataConfig,
  SkillsArtifact,
} from '../types/index.js';
import {
  ARTIFACT_BUNDLE_FORMAT_VERSION,
  parseArtifactBundle,
  type ArtifactBundle,
} from '../artifacts/bundle.js';
import { loadSearchProvider } from '../providers/loader.js';
import { LocalSearchProvider } from '../providers/search/local-search-provider.js';
import { ConfigurationError, MIGRATION_GUIDE } from '../errors.js';
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
 * Type guard to check if config passes an artifact bundle
 */
function isBundleConfig(config: McpDocsServerConfig): config is McpServerBundleConfig {
  return 'artifacts' in config;
}

/**
 * Type guard to check if config uses file-based loading
 */
function isFileConfig(config: McpDocsServerConfig): config is McpServerFileConfig {
  return 'docsPath' in config && 'indexPath' in config;
}

/**
 * Type guard to check if config uses pre-loaded data
 */
function isDataConfig(config: McpDocsServerConfig): config is McpServerDataConfig {
  return 'docs' in config && 'searchIndexData' in config;
}

/**
 * Wrap the members passed with a deprecated config in an artifact bundle, so
 * everything after loading has one shape. The manifest comes from config.
 */
function legacyBundle(
  config: McpServerBaseConfig,
  docs: Record<string, ProcessedDoc>,
  searchIndex: Record<string, unknown> | undefined,
  skills: SkillsArtifact | undefined
): ArtifactBundle {
  return {
    formatVersion: ARTIFACT_BUNDLE_FORMAT_VERSION,
    manifest: {
      serverName: config.name,
      version: config.version ?? '1.0.0',
      buildTime: '',
      docCount: Object.keys(docs).length,
      ...(config.baseUrl ? { baseUrl: config.baseUrl } : {}),
    },
    docs,
    ...(searchIndex ? { searchIndex } : {}),
    ...(skills ? { skills } : {}),
  };
}

/**
 * Read a JSON file named by a deprecated file config. Node only.
 * With `hint`, a missing or unreadable file throws; without, it returns undefined.
 */
async function readConfiguredJson(
  file: string,
  what: string,
  hint?: string
): Promise<unknown | undefined> {
  // Imported dynamically so the edge (artifacts) path pulls in no Node built-ins.
  const { readFile } = await import('node:fs/promises');
  try {
    return JSON.parse(await readFile(file, 'utf8'));
  } catch (cause) {
    if (hint === undefined) {
      return undefined;
    }
    // Paths name only files the site owner configured; safe to return.
    throw new ConfigurationError(`[MCP] ${what} not found or unreadable: ${file}. ${hint}`, {
      cause,
    });
  }
}

/** What the 2.1 local search provider threw for a data config it couldn't use. */
const LEGACY_INVALID_INIT_DATA =
  '[LocalSearch] Invalid init data: must provide either file paths (docsPath, indexPath) or pre-loaded data (docs, indexData)';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Name, version, and base URL the server reports: config first, then the bundle's manifest. */
interface ServerIdentity {
  name: string;
  version: string;
  baseUrl?: string;
}

/**
 * MCP Server for documentation
 *
 * This class provides the MCP server implementation that can be used
 * with any HTTP framework (Express, Vercel, Cloudflare Workers, etc.)
 *
 * Serves an artifact bundle: pass `artifacts`, the contents of
 * `build/mcp/bundle.json` (import it on edge runtimes, or use
 * `readArtifactBundle()` in Node). The file-based (`docsPath`/`indexPath`)
 * and pre-loaded (`docs`/`searchIndexData`) configs still work but are
 * deprecated.
 *
 * Serves MCP protocol revision 2026-07-28 statelessly, and 2025-era clients
 * (initialize handshake) from the same endpoint through a stateless
 * JSON-response transport, so their responses match 1.x (see dispatch).
 */
export class McpDocsServer {
  private config: McpDocsServerConfig;
  private bundle: ArtifactBundle | null = null;
  private identity: ServerIdentity | null = null;
  private searchProvider: SearchProvider | null = null;
  private skillsArtifact: SkillsArtifact | null = null;
  private handler: McpHttpHandler | null = null;
  private initialized = false;
  private initPromise: Promise<void> | null = null;
  private initError: Error | null = null;

  constructor(config: McpDocsServerConfig) {
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

    const { name, version } = this.getIdentity();
    const server = new McpServer(
      { name, version },
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
   * Get a document by URL: from the search provider if it implements
   * `getDocument`, otherwise from the bundle's documents.
   */
  private async getDocument(url: string): Promise<ProcessedDoc | null> {
    if (this.searchProvider?.getDocument) {
      return this.searchProvider.getDocument(url);
    }

    return this.bundle?.docs[url] ?? null;
  }

  /**
   * The identity to report. Before initialization: config, then the
   * (not yet validated) bundle manifest, then defaults.
   */
  private getIdentity(): ServerIdentity {
    if (this.identity) {
      return this.identity;
    }
    const artifacts = isBundleConfig(this.config) ? this.config.artifacts : undefined;
    const manifest =
      isRecord(artifacts) && isRecord(artifacts.manifest) ? artifacts.manifest : undefined;
    const fromManifest = (key: string) =>
      typeof manifest?.[key] === 'string' ? (manifest[key] as string) : undefined;

    return {
      name: this.config.name ?? fromManifest('serverName') ?? 'docs',
      version: this.config.version ?? fromManifest('version') ?? '1.0.0',
      baseUrl: this.config.baseUrl ?? fromManifest('baseUrl'),
    };
  }

  /**
   * Resolve any config to an artifact bundle. The deprecated file config
   * also returns its paths, which custom search providers may still read.
   *
   * @param forLocalSearch Whether the built-in local search will serve the
   *   bundle. With the deprecated configs, only it needs the documents and
   *   search index to exist; a custom provider may bring its own, as in 2.1.
   */
  private async loadBundle(forLocalSearch: boolean): Promise<{
    bundle: ArtifactBundle;
    paths?: { docsPath: string; indexPath: string };
  }> {
    const config = this.config;

    if (isBundleConfig(config)) {
      return {
        bundle: parseArtifactBundle(
          config.artifacts,
          "The server's artifacts option (expected the contents of build/mcp/bundle.json)"
        ),
      };
    }

    if (isDataConfig(config)) {
      const { docs, searchIndexData } = config;
      if (forLocalSearch && (!isRecord(docs) || !isRecord(searchIndexData))) {
        throw new Error(LEGACY_INVALID_INIT_DATA);
      }
      return {
        bundle: legacyBundle(
          config,
          isRecord(docs) ? docs : {},
          isRecord(searchIndexData) ? searchIndexData : undefined,
          config.skills
        ),
      };
    }

    if (isFileConfig(config)) {
      // Same order and messages as 2.1: skills (read by the server), then the
      // documents and index (read by the local provider).
      const skills = config.skillsPath
        ? await readConfiguredJson(
            config.skillsPath,
            'skills.json',
            'Build the site first, or remove skillsPath.'
          )
        : undefined;
      const hint = forLocalSearch ? 'Build the site first.' : undefined;
      const docs = await readConfiguredJson(config.docsPath, 'docs.json', hint);
      const searchIndex = await readConfiguredJson(config.indexPath, 'search-index.json', hint);
      return {
        bundle: legacyBundle(
          config,
          isRecord(docs) ? (docs as Record<string, ProcessedDoc>) : {},
          // The local provider validates the index itself (e.g. a stale 1.x one).
          forLocalSearch || isRecord(searchIndex)
            ? (searchIndex as Record<string, unknown>)
            : undefined,
          skills as SkillsArtifact | undefined
        ),
        paths: { docsPath: config.docsPath, indexPath: config.indexPath },
      };
    }

    throw new ConfigurationError(
      '[MCP] Invalid server config: pass artifacts (the contents of build/mcp/bundle.json). ' +
        'The deprecated file paths (docsPath, indexPath) and pre-loaded data (docs, searchIndexData) also work.'
    );
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
      throw new ConfigurationError(
        "[MCP] The 'flexsearch' server option was removed in docusaurus-plugin-mcp-server 2.0. " +
          `Remove it; use 'localSearch' to set field boosts. See ${MIGRATION_GUIDE}.`
      );
    }
    // Load the provider first, as 2.1 did, so a bad `search` module is
    // reported before any artifact problem.
    const searchSpecifier = this.config.search ?? 'local';
    const searchProvider = await loadSearchProvider(searchSpecifier, {
      localSearch: this.config.localSearch,
    });

    const { bundle, paths } = await this.loadBundle(searchProvider instanceof LocalSearchProvider);
    const { manifest } = bundle;
    const identity: ServerIdentity = {
      name: this.config.name ?? manifest.serverName,
      version: this.config.version ?? manifest.version,
      baseUrl: this.config.baseUrl ?? manifest.baseUrl,
    };

    const providerContext: ProviderContext = {
      baseUrl: identity.baseUrl ?? '',
      serverName: identity.name,
      serverVersion: identity.version,
      outputDir: '', // Not relevant for runtime
    };

    // `docs`/`indexData` (and the paths, in file mode) stay populated for
    // providers written before `bundle` existed.
    const initData: SearchProviderInitData = {
      bundle,
      docs: bundle.docs,
      ...(bundle.searchIndex ? { indexData: bundle.searchIndex } : {}),
      ...paths,
    };

    await searchProvider.initialize(providerContext, initData);

    this.bundle = bundle;
    this.identity = identity;
    this.searchProvider = searchProvider;
    this.skillsArtifact = bundle.skills ?? null;

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
    const docCount =
      this.searchProvider?.getDocCount?.() ??
      (this.bundle ? Object.keys(this.bundle.docs).length : 0);
    const { name, version, baseUrl } = this.getIdentity();

    return {
      name,
      version,
      initialized: this.initialized,
      docCount,
      skillCount: this.skillsArtifact?.skills.length ?? 0,
      baseUrl,
      searchProvider: this.searchProvider?.name,
    };
  }
}
