/**
 * Netlify adapter for MCP server
 *
 * Creates a Netlify serverless function handler for the MCP server.
 *
 * @example
 * // netlify/functions/mcp.js
 * const { createNetlifyHandler } = require('docusaurus-plugin-mcp-server/adapters');
 * const path = require('path');
 *
 * exports.handler = createNetlifyHandler({
 *   docsPath: path.join(__dirname, '../../build/mcp/docs.json'),
 *   indexPath: path.join(__dirname, '../../build/mcp/search-index.json'),
 *   name: 'my-docs',
 *   baseUrl: 'https://docs.example.com',
 * });
 */

import { McpDocsServer } from '../mcp/server.js';
import type { McpServerConfig } from '../types/index.js';

/**
 * Netlify event object (simplified interface)
 */
export interface NetlifyEvent {
  httpMethod: string;
  body: string | null;
  isBase64Encoded?: boolean;
}

/**
 * Netlify context object (simplified interface)
 */
export interface NetlifyContext {
  functionName: string;
  functionVersion?: string;
  invokedFunctionArn?: string;
  memoryLimitInMB?: string;
  awsRequestId?: string;
  logGroupName?: string;
  logStreamName?: string;
  getRemainingTimeInMillis?: () => number;
}

/**
 * Netlify function response
 */
interface NetlifyResponse {
  statusCode: number;
  headers?: Record<string, string>;
  body?: string;
}

/**
 * Create a Netlify serverless function handler for the MCP server
 */
export function createNetlifyHandler(config: McpServerConfig) {
  let server: McpDocsServer | null = null;

  function getServer(): McpDocsServer {
    if (!server) {
      server = new McpDocsServer(config);
    }
    return server;
  }

  return async function handler(
    event: NetlifyEvent,
    _context: NetlifyContext
  ): Promise<NetlifyResponse> {
    const headers = {
      'Content-Type': 'application/json',
    };

    // Only allow POST requests
    if (event.httpMethod !== 'POST') {
      return {
        statusCode: 405,
        headers,
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: null,
          error: {
            code: -32600,
            message: 'Method not allowed. Use POST.',
          },
        }),
      };
    }

    try {
      // Parse the request body
      let body: unknown;
      try {
        body = event.body ? JSON.parse(event.body) : null;
      } catch {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: null,
            error: {
              code: -32700,
              message: 'Parse error: Invalid JSON',
            },
          }),
        };
      }

      const mcpServer = getServer();
      const response = await mcpServer.handleRequest(body);

      // Handle notifications (null response)
      if (response === null) {
        return {
          statusCode: 204,
        };
      }

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify(response),
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('MCP Server Error:', error);
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: null,
          error: {
            code: -32603,
            message: `Internal server error: ${errorMessage}`,
          },
        }),
      };
    }
  };
}
