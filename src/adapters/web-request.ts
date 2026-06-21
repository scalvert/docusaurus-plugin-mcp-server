/**
 * Web-standard fetch handler for the MCP server
 *
 * Creates a handler with the standard `(request: Request) => Promise<Response>`
 * signature, so it runs on any web-standard runtime — Cloudflare Workers,
 * Netlify (modern web-standard functions), Deno, Bun, and others. Because these
 * runtimes can't access the filesystem, this adapter requires pre-loaded docs
 * and search index data.
 *
 * Uses the MCP SDK's WebStandardStreamableHTTPServerTransport for proper
 * protocol handling with Web Standard Request/Response.
 *
 * @example
 * // Cloudflare Workers — src/worker.js
 * import { createWebRequestHandler } from 'docusaurus-plugin-mcp-server/adapters';
 * import docs from '../build/mcp/docs.json';
 * import searchIndex from '../build/mcp/search-index.json';
 *
 * export default {
 *   fetch: createWebRequestHandler({
 *     docs,
 *     searchIndexData: searchIndex,
 *     name: 'my-docs',
 *     baseUrl: 'https://docs.example.com',
 *   }),
 * };
 */

import { McpDocsServer } from '../mcp/server.js';
import type { McpServerDataConfig } from '../types/index.js';
import { getCorsHeaders } from './cors.js';

/**
 * Config for the web-standard request handler
 */
export interface WebRequestAdapterConfig extends McpServerDataConfig {
  /** CORS origin to allow. Defaults to '*' (all origins). */
  corsOrigin?: string;
}

/**
 * Create a web-standard `(request: Request) => Promise<Response>` handler for
 * the MCP server, suitable for any web-standard runtime (Cloudflare Workers,
 * modern Netlify functions, Deno, Bun, etc).
 *
 * Uses the MCP SDK's WebStandardStreamableHTTPServerTransport for
 * proper protocol handling.
 */
export function createWebRequestHandler(config: WebRequestAdapterConfig) {
  let server: McpDocsServer | null = null;
  const { corsOrigin, ...serverConfig } = config;

  function getServer(): McpDocsServer {
    if (!server) {
      server = new McpDocsServer(serverConfig satisfies McpServerDataConfig);
    }
    return server;
  }

  return async function fetch(request: Request): Promise<Response> {
    const corsHeaders = getCorsHeaders(corsOrigin);

    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    // Handle GET requests for health check
    if (request.method === 'GET') {
      const mcpServer = getServer();
      const status = await mcpServer.getStatus();
      return new Response(JSON.stringify(status), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
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
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    try {
      const mcpServer = getServer();
      // Use the SDK's Web Standard transport to handle the request
      const response = await mcpServer.handleWebRequest(request);

      // Add CORS headers to the response
      const newHeaders = new Headers(response.headers);
      Object.entries(corsHeaders).forEach(([key, value]) => {
        newHeaders.set(key, value);
      });

      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: newHeaders,
      });
    } catch (error) {
      console.error('MCP Server Error:', error);
      return new Response(
        JSON.stringify({
          jsonrpc: '2.0',
          id: null,
          error: {
            code: -32603,
            message: 'Internal server error',
          },
        }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }
  };
}
