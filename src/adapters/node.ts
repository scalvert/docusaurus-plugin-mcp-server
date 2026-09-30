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
import { createHttpPolicy, jsonResponse, jsonRpcErrorBody } from './http.js';
import { toWebRequest, writeWebResponse } from './node-bridge.js';
import { internalErrorBody } from '../errors.js';

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
 * Compatible with `http.createServer()` and with Connect-style frameworks
 * such as Express: mount it for all methods on your MCP path. If a body
 * parser (e.g. `express.json()`) has already read the request, its
 * `req.body` is used. For a complete server, use `createNodeServer()`.
 *
 * The HTTP policy (preflight, status, 405, CORS, errors) is the same as the
 * web handler's; this adapter adds a 1MB body limit and JSON validation.
 */
export function createNodeHandler(options: NodeAdapterOptions) {
  const { corsOrigin = '*', ...config } = options;
  const corsHeaders = corsOrigin === false ? {} : getCorsHeaders(corsOrigin);
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

  const policy = createHttpPolicy({ getServer, corsHeaders, statusIndent: 2 });

  return async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
    try {
      await writeWebResponse(await policy(await toRequest(req)), res);
    } catch (error) {
      if (error instanceof RequestBodyError) {
        await writeWebResponse(
          jsonResponse(jsonRpcErrorBody(error.code, error.message), error.status, corsHeaders),
          res
        );
        return;
      }
      // The policy answers its own errors, so this is a failure reading the
      // request stream or writing the response.
      console.error('[MCP] Request error:', error);
      if (!res.headersSent) {
        res.writeHead(500, { ...corsHeaders, 'Content-Type': 'application/json' });
        res.end(internalErrorBody(error));
      } else {
        res.destroy(error instanceof Error ? error : undefined);
      }
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

/**
 * Convert the Node request. Only a POST body is read (bounded, and checked
 * to be JSON) before the policy runs; other methods never read theirs.
 */
async function toRequest(req: IncomingMessage): Promise<Request> {
  if (req.method !== 'POST') {
    return toWebRequest(req, undefined, { stream: false });
  }
  return toWebRequest(req, await readJsonBody(req), { stream: false });
}

const MAX_BODY_SIZE = 1024 * 1024; // 1MB

/** A request body the adapter rejects before the MCP server sees it. */
class RequestBodyError extends Error {
  constructor(
    readonly status: number,
    readonly code: number,
    message: string
  ) {
    super(message);
  }
}

const tooLarge = () => new RequestBodyError(413, -32600, 'Request body too large');
const invalidJson = () =>
  new RequestBodyError(400, -32700, 'Parse error: invalid JSON in request body');

function parseJson(text: string): unknown {
  if (!text) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    throw invalidJson();
  }
}

/**
 * The parsed JSON body, or undefined for an empty one. Uses `req.body` when a
 * body parser has already consumed the stream.
 */
async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  if (req.readableEnded) {
    const { body } = req as IncomingMessage & { body?: unknown };
    if (typeof body === 'string') return parseJson(body);
    if (body instanceof Uint8Array) return parseJson(Buffer.from(body).toString());
    return body;
  }

  return new Promise((resolve, reject) => {
    let body = '';
    let size = 0;

    req.on('data', (chunk: Buffer | string) => {
      size += typeof chunk === 'string' ? Buffer.byteLength(chunk) : chunk.length;
      if (size > MAX_BODY_SIZE) {
        // Stop accumulating (bounded memory) and reject so the handler can send
        // a 413. Don't destroy the socket here, or the client never sees it.
        reject(tooLarge());
        return;
      }
      body += chunk.toString();
    });
    req.on('end', () => {
      try {
        resolve(parseJson(body));
      } catch (error) {
        reject(error);
      }
    });
    req.on('error', reject);
  });
}
