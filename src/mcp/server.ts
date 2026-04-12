import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type {
  ProcessedDoc,
  McpServerConfig,
  McpServerFileConfig,
  McpServerDataConfig,
} from '../types/index.js';
import { loadSearchProvider } from '../providers/loader.js';
import type {
  SearchProvider,
  ProviderContext,
  SearchProviderInitData,
} from '../providers/types.js';
import { docsSearchTool, formatSearchResults } from './tools/docs-search.js';
import { docsFetchTool, formatPageContent } from './tools/docs-fetch.js';

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
 * Uses the official MCP SDK for proper protocol handling.
 */
export class McpDocsServer {
  private config: McpServerConfig;
  private searchProvider: SearchProvider | null = null;
  private initialized = false;
  private initPromise: Promise<void> | null = null;
  private initError: Error | null = null;

  constructor(config: McpServerConfig) {
    this.config = config;
  }

  /**
   * Create a fresh McpServer instance with tools registered.
   * Each request gets its own server to avoid concurrency issues
   * with the SDK's transport reassignment.
   */
  private createMcpServer(): McpServer {
    const server = new McpServer(
      {
        name: this.config.name,
        version: this.config.version ?? '1.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.registerTools(server);
    return server;
  }

  /**
   * Register all MCP tools using definitions from tool files
   */
  private registerTools(server: McpServer): void {
    // Register docs_search tool
    server.registerTool(
      docsSearchTool.name,
      {
        description: docsSearchTool.description,
        inputSchema: docsSearchTool.inputSchema,
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

    // Register docs_fetch tool
    server.registerTool(
      docsFetchTool.name,
      {
        description: docsFetchTool.description,
        inputSchema: docsFetchTool.inputSchema,
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
    // Load the search provider
    const searchSpecifier = this.config.search ?? 'flexsearch';
    this.searchProvider = await loadSearchProvider(searchSpecifier);

    // Build provider context
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
    } else if (isFileConfig(this.config)) {
      // File-based mode (Node.js)
      initData.docsPath = this.config.docsPath;
      initData.indexPath = this.config.indexPath;
    } else {
      throw new Error('Invalid server config: must provide either file paths or pre-loaded data');
    }

    // Initialize the search provider
    await this.searchProvider.initialize(providerContext, initData);

    this.initialized = true;
  }

  /**
   * Handle an HTTP request using the MCP SDK's transport
   *
   * This method is designed for serverless environments (Vercel, Netlify).
   * Creates a fresh McpServer per request to avoid concurrency issues.
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
    await this.initialize();

    const server = this.createMcpServer();

    // Create a stateless transport for this request
    // enableJsonResponse: true means we get simple JSON responses instead of SSE
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined, // Stateless mode - no session tracking
      enableJsonResponse: true, // Return JSON instead of SSE streams
    });

    // Connect the server to this transport
    await server.connect(transport);

    try {
      // Let the transport handle the request
      await transport.handleRequest(req, res, parsedBody);
    } finally {
      // Clean up the transport after request
      await transport.close();
    }
  }

  /**
   * Handle a Web Standard Request (Cloudflare Workers, Deno, Bun)
   *
   * This method is designed for Web Standard environments that use
   * the Fetch API Request/Response pattern.
   * Creates a fresh McpServer per request to avoid concurrency issues.
   *
   * @param request - Web Standard Request object
   * @returns Web Standard Response object
   */
  async handleWebRequest(request: Request): Promise<Response> {
    await this.initialize();

    const server = this.createMcpServer();

    // Create a stateless transport for Web Standards
    const transport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: undefined, // Stateless mode
      enableJsonResponse: true,
    });

    // Connect the server to this transport
    await server.connect(transport);

    try {
      // Let the transport handle the request and return the response
      return await transport.handleRequest(request);
    } finally {
      // Clean up the transport after request
      await transport.close();
    }
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
      baseUrl: this.config.baseUrl,
      searchProvider: this.searchProvider?.name,
    };
  }
}
