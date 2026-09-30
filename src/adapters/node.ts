/**
 * Node.js adapter for MCP server
 *
 * Creates a standalone HTTP server for local development and testing.
 *
 * @example
 * ```typescript
 * import { createNodeServer } from 'docusaurus-plugin-mcp-server/adapters/node';
 *
 * const server = createNodeServer({ artifactsDir: './build/mcp' });
 *
 * server.listen(3456, () => {
 *   console.log('MCP server running at http://localhost:3456');
 * });
 * ```
 */

import { createServer, type Server, type IncomingMessage, type ServerResponse } from 'node:http';
import { McpDocsServer } from '../mcp/server.js';
import type { McpServerBundleConfig, McpServerConfig } from '../types/index.js';
import { readArtifactBundle } from '../artifacts/node.js';
import { getCorsHeaders } from './cors.js';
import { ConfigurationError, internalErrorBody } from '../errors.js';

/**
 * Server config that reads the artifact bundle from a directory, such as
 * `build/mcp`. Relative paths resolve against the working directory.
 */
export interface McpServerBundleDirConfig extends Omit<McpServerBundleConfig, 'artifacts'> {
  /** Directory holding the built artifact bundle (`bundle.json`, or the 2.0/2.1 per-file layout) */
  artifactsDir: string;
}

interface NodeCorsOption {
  /**
   * CORS origin to allow. Defaults to '*' (all origins).
   * Set to a specific origin or false to disable CORS headers.
   */
  corsOrigin?: string | false;
}

/**
 * The 2.0/2.1 options for the Node.js MCP server: file paths or pre-loaded
 * data, plus a CORS override.
 *
 * @deprecated Since 2.2. Pass `{ artifactsDir }` or `{ artifacts }` (see
 * {@link NodeAdapterOptions}). Removed in 3.0.
 */
export type NodeServerOptions = McpServerConfig & NodeCorsOption;

/**
 * Options for the Node.js MCP server: `{ artifactsDir }` (the usual local-dev
 * case) or `{ artifacts }`, plus a CORS override, or the deprecated
 * {@link NodeServerOptions}.
 */
export type NodeAdapterOptions =
  ((McpServerBundleDirConfig | McpServerBundleConfig) & NodeCorsOption) | NodeServerOptions;

/**
 * Create a Node.js request handler for the MCP server.
 *
 * This returns a handler function compatible with `http.createServer()`.
 * For a complete server, use `createNodeServer()` instead.
 */
export function createNodeHandler(options: NodeAdapterOptions) {
  const { corsOrigin = '*', ...config } = options;
  let server: Promise<McpDocsServer> | null = null;

  // Created once. A bundle that fails to read stays failed, like a server
  // whose initialize() failed: restart after rebuilding.
  function getServer(): Promise<McpDocsServer> {
    if (!server) {
      if ('artifactsDir' in config) {
        const { artifactsDir, ...rest } = config;
        server = readArtifactBundle(artifactsDir).then(
          (artifacts) => new McpDocsServer({ ...rest, artifacts })
        );
      } else {
        server = Promise.resolve(new McpDocsServer(config));
      }
    }
    return server;
  }

  function setCorsHeaders(res: ServerResponse): void {
    if (corsOrigin !== false) {
      for (const [key, value] of Object.entries(getCorsHeaders(corsOrigin))) {
        res.setHeader(key, value);
      }
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
        const mcpServer = await getServer();
        // Initialize so a broken deployment shows up in the health check.
        await mcpServer.initialize();
        const status = await mcpServer.getStatus();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(status, null, 2));
      } catch (error) {
        console.error('[MCP] Status error:', error);
        const message =
          error instanceof ConfigurationError ? error.message : 'Internal server error';
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
      const mcpServer = await getServer();
      await mcpServer.handleHttpRequest(req, res, body);
    } catch (error) {
      console.error('[MCP] Request error:', error);

      if (error instanceof Error && error.message === 'Request body too large') {
        res.writeHead(413, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            jsonrpc: '2.0',
            id: null,
            error: {
              code: -32600,
              message: 'Request body too large',
            },
          })
        );
        return;
      }

      if (error instanceof Error && error.message === 'Invalid JSON in request body') {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            jsonrpc: '2.0',
            id: null,
            error: {
              code: -32700,
              message: 'Parse error: invalid JSON in request body',
            },
          })
        );
        return;
      }

      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(internalErrorBody(error));
    }
  };
}

/**
 * Create a complete Node.js HTTP server for the MCP server.
 *
 * This is the simplest way to run an MCP server locally for development.
 */
export function createNodeServer(options: NodeAdapterOptions): Server {
  const handler = createNodeHandler(options);
  return createServer(handler);
}

const MAX_BODY_SIZE = 1024 * 1024; // 1MB

/**
 * Parse the request body as JSON
 */
async function parseRequestBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let body = '';
    let size = 0;

    req.on('data', (chunk: Buffer | string) => {
      size += typeof chunk === 'string' ? Buffer.byteLength(chunk) : chunk.length;
      if (size > MAX_BODY_SIZE) {
        // Stop accumulating (bounded memory) and reject so the handler can send
        // a 413. Don't destroy the socket here, or the client never sees it.
        reject(new Error('Request body too large'));
        return;
      }
      body += chunk.toString();
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
