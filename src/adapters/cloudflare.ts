/**
 * Cloudflare Workers adapter for MCP server
 *
 * Creates a Cloudflare Workers fetch handler for the MCP server.
 * Since Workers can't access the filesystem, this adapter requires
 * pre-loaded docs and search index data.
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
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };

    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers });
    }

    // Only allow POST requests
    if (request.method !== 'POST') {
      return new Response(
        JSON.stringify({
          jsonrpc: '2.0',
          id: null,
          error: {
            code: -32600,
            message: 'Method not allowed. Use POST.',
          },
        }),
        { status: 405, headers }
      );
    }

    try {
      // Parse the request body
      let body: unknown;
      try {
        body = await request.json();
      } catch {
        return new Response(
          JSON.stringify({
            jsonrpc: '2.0',
            id: null,
            error: {
              code: -32700,
              message: 'Parse error: Invalid JSON',
            },
          }),
          { status: 400, headers }
        );
      }

      const mcpServer = getServer();
      const response = await mcpServer.handleRequest(body);

      // Handle notifications (null response)
      if (response === null) {
        return new Response(null, { status: 204, headers });
      }

      return new Response(JSON.stringify(response), { status: 200, headers });
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
        { status: 500, headers }
      );
    }
  };
}
