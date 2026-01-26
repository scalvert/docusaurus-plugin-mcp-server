/**
 * Node.js adapter for MCP server
 *
 * Creates a standalone HTTP server for local development and testing.
 *
 * @example
 * ```typescript
 * import { createNodeServer } from 'docusaurus-plugin-mcp-server/adapters';
 *
 * const server = createNodeServer({
 *   docsPath: './build/mcp/docs.json',
 *   indexPath: './build/mcp/search-index.json',
 *   name: 'my-docs',
 * });
 *
 * server.listen(3456, () => {
 *   console.log('MCP server running at http://localhost:3456');
 * });
 * ```
 */

import { createServer, type Server, type IncomingMessage, type ServerResponse } from 'node:http';
import { McpDocsServer } from '../mcp/server.js';
import type { McpServerFileConfig } from '../types/index.js';

/**
 * Options for the Node.js MCP server
 */
export interface NodeServerOptions extends McpServerFileConfig {
  /**
   * CORS origin to allow. Defaults to '*' (all origins).
   * Set to a specific origin or false to disable CORS headers.
   */
  corsOrigin?: string | false;
}

/**
 * Create a Node.js request handler for the MCP server.
 *
 * This returns a handler function compatible with `http.createServer()`.
 * For a complete server, use `createNodeServer()` instead.
 */
export function createNodeHandler(options: NodeServerOptions) {
  const { corsOrigin = '*', ...config } = options;
  let server: McpDocsServer | null = null;

  function getServer(): McpDocsServer {
    if (!server) {
      server = new McpDocsServer(config);
    }
    return server;
  }

  function setCorsHeaders(res: ServerResponse): void {
    if (corsOrigin !== false) {
      res.setHeader('Access-Control-Allow-Origin', corsOrigin);
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    }
  }

  return async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
    setCorsHeaders(res);

    // Handle CORS preflight
    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    // Handle GET requests for health check
    if (req.method === 'GET') {
      try {
        const mcpServer = getServer();
        const status = await mcpServer.getStatus();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(status, null, 2));
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: message }));
      }
      return;
    }

    // Only allow POST requests for MCP
    if (req.method !== 'POST') {
      res.writeHead(405, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          jsonrpc: '2.0',
          id: null,
          error: {
            code: -32600,
            message: 'Method not allowed. Use POST for MCP requests, GET for status.',
          },
        })
      );
      return;
    }

    // Parse request body
    try {
      const body = await parseRequestBody(req);
      const mcpServer = getServer();
      await mcpServer.handleHttpRequest(req, res, body);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error('[MCP] Request error:', error);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          jsonrpc: '2.0',
          id: null,
          error: {
            code: -32603,
            message: `Internal server error: ${message}`,
          },
        })
      );
    }
  };
}

/**
 * Create a complete Node.js HTTP server for the MCP server.
 *
 * This is the simplest way to run an MCP server locally for development.
 */
export function createNodeServer(options: NodeServerOptions): Server {
  const handler = createNodeHandler(options);
  return createServer(handler);
}

/**
 * Parse the request body as JSON
 */
async function parseRequestBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
    });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : undefined);
      } catch {
        reject(new Error('Invalid JSON in request body'));
      }
    });
    req.on('error', reject);
  });
}
