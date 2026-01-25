/**
 * Cloudflare Workers adapter for MCP server
 *
 * Creates a Cloudflare Workers fetch handler for the MCP server.
 * Since Workers can't access the filesystem, this adapter requires
 * pre-loaded docs and search index data.
 *
 * Uses the MCP SDK's WebStandardStreamableHTTPServerTransport for proper
 * protocol handling with Web Standard Request/Response.
 *
 * @example
 * // src/worker.js
 * import { createCloudflareHandler } from 'docusaurus-plugin-mcp-server/adapters';
 * import docs from '../build/mcp/docs.json';
 * import searchIndex from '../build/mcp/search-index.json';
 *
 * export default {
 *   fetch: createCloudflareHandler({
 *     docs,
 *     searchIndexData: searchIndex,
 *     name: 'my-docs',
 *     baseUrl: 'https://docs.example.com',
 *   }),
 * };
 */

import { McpDocsServer } from '../mcp/server.js';
import type { ProcessedDoc, McpServerDataConfig } from '../types/index.js';

/**
 * Config for Cloudflare Workers adapter
 */
export interface CloudflareAdapterConfig {
  /** Pre-loaded docs data (imported from docs.json) */
  docs: Record<string, ProcessedDoc>;
  /** Pre-loaded search index data (imported from search-index.json) */
  searchIndexData: Record<string, unknown>;
  /** Server name */
  name: string;
  /** Server version */
  version?: string;
  /** Base URL for constructing full page URLs */
  baseUrl?: string;
}

/**
 * Create a Cloudflare Workers fetch handler for the MCP server
 *
 * Uses the MCP SDK's WebStandardStreamableHTTPServerTransport for
 * proper protocol handling.
 */
export function createCloudflareHandler(config: CloudflareAdapterConfig) {
  let server: McpDocsServer | null = null;

  const serverConfig: McpServerDataConfig = {
    docs: config.docs,
    searchIndexData: config.searchIndexData,
    name: config.name,
    version: config.version,
    baseUrl: config.baseUrl,
  };

  function getServer(): McpDocsServer {
    if (!server) {
      server = new McpDocsServer(serverConfig);
    }
    return server;
  }

  return async function fetch(request: Request): Promise<Response> {
    const headers = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };

    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers });
    }

    // Handle GET requests for health check
    if (request.method === 'GET') {
      const mcpServer = getServer();
      const status = await mcpServer.getStatus();
      return new Response(JSON.stringify(status), {
        status: 200,
        headers: { ...headers, 'Content-Type': 'application/json' },
      });
    }

    // Only allow POST requests for MCP
    if (request.method !== 'POST') {
      return new Response(
        JSON.stringify({
          jsonrpc: '2.0',
          id: null,
          error: {
            code: -32600,
            message: 'Method not allowed. Use POST for MCP requests, GET for status.',
          },
        }),
        {
          status: 405,
          headers: { ...headers, 'Content-Type': 'application/json' },
        }
      );
    }

    try {
      const mcpServer = getServer();
      // Use the SDK's Web Standard transport to handle the request
      const response = await mcpServer.handleWebRequest(request);

      // Add CORS headers to the response
      const newHeaders = new Headers(response.headers);
      Object.entries(headers).forEach(([key, value]) => {
        newHeaders.set(key, value);
      });

      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: newHeaders,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('MCP Server Error:', error);
      return new Response(
        JSON.stringify({
          jsonrpc: '2.0',
          id: null,
          error: {
            code: -32603,
            message: `Internal server error: ${errorMessage}`,
          },
        }),
        {
          status: 500,
          headers: { ...headers, 'Content-Type': 'application/json' },
        }
      );
    }
  };
}
