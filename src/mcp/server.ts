import fs from 'fs-extra';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import type {
  ProcessedDoc,
  McpServerConfig,
  McpServerFileConfig,
  McpServerDataConfig,
} from '../types/index.js';
import { importSearchIndex, type FlexSearchDocument } from '../search/flexsearch-indexer.js';
import { docsSearchTool, executeDocsSearch, formatSearchResults } from './tools/docs-search.js';
import { docsGetPageTool, executeDocsGetPage, formatPageContent } from './tools/docs-get-page.js';
import {
  docsGetSectionTool,
  executeDocsGetSection,
  formatSectionContent,
} from './tools/docs-get-section.js';

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
 */
export class McpDocsServer {
  private config: McpServerConfig;
  private docs: Record<string, ProcessedDoc> | null = null;
  private searchIndex: FlexSearchDocument | null = null;
  private server: Server;
  private initialized = false;

  constructor(config: McpServerConfig) {
    this.config = config;

    // Create MCP server
    this.server = new Server(
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

    this.setupHandlers();
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
   * Set up MCP request handlers
   */
  private setupHandlers(): void {
    // List available tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [docsSearchTool, docsGetPageTool, docsGetSectionTool],
      };
    });

    // Handle tool calls
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      await this.initialize();

      if (!this.docs || !this.searchIndex) {
        return {
          content: [
            {
              type: 'text',
              text: 'Server not initialized. Please try again.',
            },
          ],
          isError: true,
        };
      }

      const { name, arguments: args } = request.params;

      try {
        switch (name) {
          case 'docs_search': {
            const params = args as {
              query: string;
              limit?: number;
            };
            const results = executeDocsSearch(params, this.searchIndex, this.docs);
            return {
              content: [
                {
                  type: 'text',
                  text: formatSearchResults(results, this.config.baseUrl),
                },
              ],
            };
          }

          case 'docs_get_page': {
            const params = args as { route: string };
            const doc = executeDocsGetPage(params, this.docs);
            return {
              content: [
                {
                  type: 'text',
                  text: formatPageContent(doc, this.config.baseUrl),
                },
              ],
            };
          }

          case 'docs_get_section': {
            const params = args as { route: string; headingId: string };
            const result = executeDocsGetSection(params, this.docs);
            return {
              content: [
                {
                  type: 'text',
                  text: formatSectionContent(result, params.headingId, this.config.baseUrl),
                },
              ],
            };
          }

          default:
            return {
              content: [
                {
                  type: 'text',
                  text: `Unknown tool: ${name}`,
                },
              ],
              isError: true,
            };
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        return {
          content: [
            {
              type: 'text',
              text: `Error executing tool ${name}: ${errorMessage}`,
            },
          ],
          isError: true,
        };
      }
    });
  }

  /**
   * Handle an MCP JSON-RPC request
   *
   * This method can be used with any HTTP framework.
   * It takes the request body and returns the response body.
   */
  async handleRequest(body: unknown): Promise<unknown> {
    await this.initialize();

    // The MCP SDK Server doesn't have a direct handleRequest method,
    // so we need to create a simple JSON-RPC handler

    if (!body || typeof body !== 'object') {
      return {
        jsonrpc: '2.0',
        id: null,
        error: {
          code: -32600,
          message: 'Invalid Request',
        },
      };
    }

    const request = body as {
      jsonrpc?: string;
      id?: number | string | null;
      method?: string;
      params?: unknown;
    };

    if (request.jsonrpc !== '2.0' || !request.method) {
      return {
        jsonrpc: '2.0',
        id: request.id ?? null,
        error: {
          code: -32600,
          message: 'Invalid Request',
        },
      };
    }

    try {
      // Handle standard MCP methods
      switch (request.method) {
        case 'initialize':
          return {
            jsonrpc: '2.0',
            id: request.id,
            result: {
              protocolVersion: '2024-11-05',
              capabilities: {
                tools: {},
              },
              serverInfo: {
                name: this.config.name,
                version: this.config.version ?? '1.0.0',
              },
            },
          };

        case 'tools/list':
          return {
            jsonrpc: '2.0',
            id: request.id,
            result: {
              tools: [docsSearchTool, docsGetPageTool, docsGetSectionTool],
            },
          };

        case 'tools/call': {
          await this.initialize();

          if (!this.docs || !this.searchIndex) {
            return {
              jsonrpc: '2.0',
              id: request.id,
              error: {
                code: -32603,
                message: 'Server not initialized',
              },
            };
          }

          const params = request.params as { name: string; arguments?: unknown };
          const toolName = params.name;
          const toolArgs = params.arguments ?? {};

          let resultText: string;

          switch (toolName) {
            case 'docs_search': {
              const searchParams = toolArgs as {
                query: string;
                limit?: number;
              };
              const results = executeDocsSearch(searchParams, this.searchIndex, this.docs);
              resultText = formatSearchResults(results, this.config.baseUrl);
              break;
            }

            case 'docs_get_page': {
              const pageParams = toolArgs as { route: string };
              const doc = executeDocsGetPage(pageParams, this.docs);
              resultText = formatPageContent(doc, this.config.baseUrl);
              break;
            }

            case 'docs_get_section': {
              const sectionParams = toolArgs as { route: string; headingId: string };
              const result = executeDocsGetSection(sectionParams, this.docs);
              resultText = formatSectionContent(
                result,
                sectionParams.headingId,
                this.config.baseUrl
              );
              break;
            }

            default:
              return {
                jsonrpc: '2.0',
                id: request.id,
                error: {
                  code: -32602,
                  message: `Unknown tool: ${toolName}`,
                },
              };
          }

          return {
            jsonrpc: '2.0',
            id: request.id,
            result: {
              content: [
                {
                  type: 'text',
                  text: resultText,
                },
              ],
            },
          };
        }

        case 'notifications/initialized':
        case 'notifications/cancelled':
          // These are notifications, no response needed
          return null;

        default:
          return {
            jsonrpc: '2.0',
            id: request.id,
            error: {
              code: -32601,
              message: `Method not found: ${request.method}`,
            },
          };
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        jsonrpc: '2.0',
        id: request.id,
        error: {
          code: -32603,
          message: `Internal error: ${errorMessage}`,
        },
      };
    }
  }

  /**
   * Get the underlying MCP Server instance
   * Useful for advanced use cases like stdio transport
   */
  getServer(): Server {
    return this.server;
  }
}
