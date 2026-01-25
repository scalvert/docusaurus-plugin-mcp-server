import fs from 'fs-extra';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { z } from 'zod';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type {
  ProcessedDoc,
  McpServerConfig,
  McpServerFileConfig,
  McpServerDataConfig,
} from '../types/index.js';
import { importSearchIndex, type FlexSearchDocument } from '../search/flexsearch-indexer.js';
import { executeDocsSearch, formatSearchResults } from './tools/docs-search.js';
import { executeDocsGetPage, formatPageContent } from './tools/docs-get-page.js';
import { executeDocsGetSection, formatSectionContent } from './tools/docs-get-section.js';

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
  private docs: Record<string, ProcessedDoc> | null = null;
  private searchIndex: FlexSearchDocument | null = null;
  private mcpServer: McpServer;
  private initialized = false;

  constructor(config: McpServerConfig) {
    this.config = config;

    // Create MCP server using the high-level API
    this.mcpServer = new McpServer(
      {
        name: config.name,
        version: config.version ?? '1.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.registerTools();
  }

  /**
   * Register all MCP tools using the SDK's registerTool API
   */
  private registerTools(): void {
    // docs_search - Search across documentation
    this.mcpServer.registerTool(
      'docs_search',
      {
        description:
          'Search the documentation for relevant pages. Returns matching documents with snippets and relevance scores. Use this to find information across all documentation.',
        inputSchema: {
          query: z.string().min(1).describe('The search query string'),
          limit: z
            .number()
            .int()
            .min(1)
            .max(20)
            .optional()
            .default(5)
            .describe('Maximum number of results to return (1-20, default: 5)'),
        },
      },
      async ({ query, limit }) => {
        await this.initialize();

        if (!this.docs || !this.searchIndex) {
          return {
            content: [{ type: 'text' as const, text: 'Server not initialized. Please try again.' }],
            isError: true,
          };
        }

        const results = executeDocsSearch({ query, limit }, this.searchIndex, this.docs);
        return {
          content: [
            { type: 'text' as const, text: formatSearchResults(results, this.config.baseUrl) },
          ],
        };
      }
    );

    // docs_get_page - Retrieve full page content
    this.mcpServer.registerTool(
      'docs_get_page',
      {
        description:
          'Retrieve the complete content of a documentation page as markdown. Use this when you need the full content of a specific page.',
        inputSchema: {
          route: z
            .string()
            .min(1)
            .describe('The page route path (e.g., "/docs/getting-started" or "/api/reference")'),
        },
      },
      async ({ route }) => {
        await this.initialize();

        if (!this.docs) {
          return {
            content: [{ type: 'text' as const, text: 'Server not initialized. Please try again.' }],
            isError: true,
          };
        }

        const doc = executeDocsGetPage({ route }, this.docs);
        return {
          content: [{ type: 'text' as const, text: formatPageContent(doc, this.config.baseUrl) }],
        };
      }
    );

    // docs_get_section - Retrieve a specific section
    this.mcpServer.registerTool(
      'docs_get_section',
      {
        description:
          'Retrieve a specific section from a documentation page by its heading ID. Use this when you need only a portion of a page rather than the entire content.',
        inputSchema: {
          route: z.string().min(1).describe('The page route path'),
          headingId: z
            .string()
            .min(1)
            .describe(
              'The heading ID of the section to extract (e.g., "installation", "api-reference")'
            ),
        },
      },
      async ({ route, headingId }) => {
        await this.initialize();

        if (!this.docs) {
          return {
            content: [{ type: 'text' as const, text: 'Server not initialized. Please try again.' }],
            isError: true,
          };
        }

        const result = executeDocsGetSection({ route, headingId }, this.docs);
        return {
          content: [
            {
              type: 'text' as const,
              text: formatSectionContent(result, headingId, this.config.baseUrl),
            },
          ],
        };
      }
    );
  }

  /**
   * Load docs and search index
   *
   * For file-based config: reads from disk
   * For data config: uses pre-loaded data directly
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    try {
      if (isDataConfig(this.config)) {
        // Pre-loaded data mode (Cloudflare Workers, etc.)
        this.docs = this.config.docs;
        this.searchIndex = await importSearchIndex(this.config.searchIndexData);
      } else if (isFileConfig(this.config)) {
        // File-based mode (Node.js)
        if (await fs.pathExists(this.config.docsPath)) {
          this.docs = await fs.readJson(this.config.docsPath);
        } else {
          throw new Error(`Docs file not found: ${this.config.docsPath}`);
        }

        if (await fs.pathExists(this.config.indexPath)) {
          const indexData = await fs.readJson(this.config.indexPath);
          this.searchIndex = await importSearchIndex(indexData);
        } else {
          throw new Error(`Search index not found: ${this.config.indexPath}`);
        }
      } else {
        throw new Error('Invalid server config: must provide either file paths or pre-loaded data');
      }

      this.initialized = true;
    } catch (error) {
      console.error('[MCP] Failed to initialize:', error);
      throw error;
    }
  }

  /**
   * Handle an HTTP request using the MCP SDK's transport
   *
   * This method is designed for serverless environments (Vercel, Netlify).
   * It creates a stateless transport instance and processes the request.
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

    // Create a stateless transport for this request
    // enableJsonResponse: true means we get simple JSON responses instead of SSE
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined, // Stateless mode - no session tracking
      enableJsonResponse: true, // Return JSON instead of SSE streams
    });

    // Connect the server to this transport
    await this.mcpServer.connect(transport);

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
   *
   * @param request - Web Standard Request object
   * @returns Web Standard Response object
   */
  async handleWebRequest(request: Request): Promise<Response> {
    await this.initialize();

    // Create a stateless transport for Web Standards
    const transport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: undefined, // Stateless mode
      enableJsonResponse: true,
    });

    // Connect the server to this transport
    await this.mcpServer.connect(transport);

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
  }> {
    return {
      name: this.config.name,
      version: this.config.version ?? '1.0.0',
      initialized: this.initialized,
      docCount: this.docs ? Object.keys(this.docs).length : 0,
      baseUrl: this.config.baseUrl,
    };
  }

  /**
   * Get the underlying McpServer instance
   *
   * Useful for advanced use cases like custom transports
   */
  getMcpServer(): McpServer {
    return this.mcpServer;
  }
}
