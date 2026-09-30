/**
 * The HTTP policy every adapter applies, on web-standard Request/Response:
 * CORS preflight, the GET status check, 405 for other methods, CORS on every
 * response, and how errors reach the wire. The web handler is this policy;
 * the Node adapter bounds and reads the body, then bridges into it.
 *
 * Edge-safe: no Node built-ins.
 */

import type { McpDocsServer } from '../mcp/server.js';
import { ConfigurationError, internalErrorBody } from '../errors.js';

export interface HttpPolicyOptions {
  /**
   * The server to serve. Called per request; memoize it. A rejection is
   * reported like a failed `initialize()`.
   */
  getServer: () => Promise<McpDocsServer>;
  /** Headers added to every response, e.g. from `getCorsHeaders()`. Empty to add none. */
  corsHeaders: Record<string, string>;
  /** JSON indentation for the GET status body. The Node server pretty-prints it. */
  statusIndent?: number;
}

/** A JSON response carrying the CORS headers. */
export function jsonResponse(
  body: string,
  status: number,
  corsHeaders: Record<string, string>
): Response {
  return new Response(body, {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

/** A JSON-RPC error with no request ID, as sent before the SDK sees the request. */
export function jsonRpcErrorBody(code: number, message: string): string {
  return JSON.stringify({ jsonrpc: '2.0', id: null, error: { code, message } });
}

export function createHttpPolicy(options: HttpPolicyOptions) {
  const { getServer, corsHeaders, statusIndent } = options;

  return async function handle(request: Request): Promise<Response> {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    if (request.method === 'GET') {
      try {
        const server = await getServer();
        // Initialize so a broken deployment (e.g. a stale 1.x index) shows up
        // in the status check rather than only on the first MCP request.
        await server.initialize();
        const status = await server.getStatus();
        return jsonResponse(JSON.stringify(status, null, statusIndent), 200, corsHeaders);
      } catch (error) {
        console.error('[MCP] Status error:', error);
        const message =
          error instanceof ConfigurationError ? error.message : 'Internal server error';
        return jsonResponse(JSON.stringify({ error: message }), 500, corsHeaders);
      }
    }

    if (request.method !== 'POST') {
      return jsonResponse(
        jsonRpcErrorBody(-32600, 'Method not allowed. Use POST for MCP requests, GET for status.'),
        405,
        corsHeaders
      );
    }

    try {
      const server = await getServer();
      const response = await server.handleWebRequest(request);
      const headers = new Headers(response.headers);
      for (const [key, value] of Object.entries(corsHeaders)) {
        headers.set(key, value);
      }
      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers,
      });
    } catch (error) {
      console.error('[MCP] Request error:', error);
      return jsonResponse(internalErrorBody(error), 500, corsHeaders);
    }
  };
}
