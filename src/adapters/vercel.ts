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

import type { IncomingMessage, ServerResponse } from 'node:http';
import { McpDocsServer } from '../mcp/server.js';
import type { McpServerConfig } from '../types/index.js';
import { getCorsHeaders } from './cors.js';

/**
 * Vercel request object (extends Node.js IncomingMessage)
 */
export interface VercelRequest extends IncomingMessage {
  body?: unknown;
}

/**
 * Vercel response object (extends Node.js ServerResponse)
 */
export interface VercelResponse extends ServerResponse {
  status(code: number): VercelResponse;
  json(data: unknown): void;
}

/**
 * Create a Vercel serverless function handler for the MCP server
 *
 * Uses the MCP SDK's StreamableHTTPServerTransport for proper protocol handling.
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
    const corsHeaders = getCorsHeaders();

    // Handle CORS preflight
    if (req.method === 'OPTIONS') {
      res.writeHead(204, corsHeaders);
      res.end();
      return;
    }

    // Handle GET requests for health check
    if (req.method === 'GET') {
      Object.entries(corsHeaders).forEach(([key, value]) => {
        res.setHeader(key, value);
      });
      const mcpServer = getServer();
      const status = await mcpServer.getStatus();
      return res.status(200).json(status);
    }

    // Only allow POST requests for MCP
    if (req.method !== 'POST') {
      Object.entries(corsHeaders).forEach(([key, value]) => {
        res.setHeader(key, value);
      });
      return res.status(405).json({
        jsonrpc: '2.0',
        id: null,
        error: {
          code: -32600,
          message: 'Method not allowed. Use POST for MCP requests, GET for status.',
        },
      });
    }

    try {
      // Set CORS headers before handling
      Object.entries(corsHeaders).forEach(([key, value]) => {
        res.setHeader(key, value);
      });

      const mcpServer = getServer();
      // Use the SDK transport to handle the request
      await mcpServer.handleHttpRequest(req, res, req.body);
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
