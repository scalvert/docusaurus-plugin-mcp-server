/**
 * Vercel adapter for MCP server
 *
 * Creates a Vercel serverless function handler for the MCP server.
 *
 * @example
 * // api/mcp.js
 * const { createVercelHandler } = require('docusaurus-plugin-mcp-server/adapters');
 * const path = require('path');
 *
 * module.exports = createVercelHandler({
 *   docsPath: path.join(__dirname, '../build/mcp/docs.json'),
 *   indexPath: path.join(__dirname, '../build/mcp/search-index.json'),
 *   name: 'my-docs',
 *   baseUrl: 'https://docs.example.com',
 * });
 */

import { McpDocsServer } from '../mcp/server.js';
import type { McpServerConfig } from '../types/index.js';

/**
 * Vercel request object (simplified interface)
 */
export interface VercelRequest {
  method?: string;
  body?: unknown;
}

/**
 * Vercel response object (simplified interface)
 */
export interface VercelResponse {
  status(code: number): VercelResponse;
  json(data: unknown): void;
  end(): void;
}

/**
 * Create a Vercel serverless function handler for the MCP server
 */
export function createVercelHandler(config: McpServerConfig) {
  let server: McpDocsServer | null = null;

  function getServer(): McpDocsServer {
    if (!server) {
      server = new McpDocsServer(config);
    }
    return server;
  }

  return async function handler(req: VercelRequest, res: VercelResponse) {
    // Only allow POST requests
    if (req.method !== 'POST') {
      return res.status(405).json({
        jsonrpc: '2.0',
        id: null,
        error: {
          code: -32600,
          message: 'Method not allowed. Use POST.',
        },
      });
    }

    try {
      const mcpServer = getServer();
      const response = await mcpServer.handleRequest(req.body);

      // Handle notifications (null response)
      if (response === null) {
        return res.status(204).end();
      }

      return res.status(200).json(response);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('MCP Server Error:', error);
      return res.status(500).json({
        jsonrpc: '2.0',
        id: null,
        error: {
          code: -32603,
          message: `Internal server error: ${errorMessage}`,
        },
      });
    }
  };
}
