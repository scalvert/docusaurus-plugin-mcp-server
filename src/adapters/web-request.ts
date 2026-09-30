/**
 * Web-standard fetch handler for the MCP server
 *
 * Creates a handler with the standard `(request: Request) => Promise<Response>`
 * signature, so it runs on any web-standard runtime — Cloudflare Workers,
 * Netlify (modern web-standard functions), Deno, Bun, and others. Because these
 * runtimes can't access the filesystem, import the artifact bundle
 * (`build/mcp/bundle.json`) through your bundler and pass it as `artifacts`.
 *
 * The HTTP policy (preflight, status, 405, CORS, errors) lives in `./http.ts`
 * and is shared with the Node adapter.
 *
 * @example
 * // Cloudflare Workers — src/worker.js
 * import { createWebRequestHandler } from 'docusaurus-plugin-mcp-server/adapters';
 * import bundle from '../build/mcp/bundle.json';
 *
 * export default {
 *   fetch: createWebRequestHandler({ artifacts: bundle }),
 * };
 */

import { McpDocsServer } from '../mcp/server.js';
import type { McpServerBundleConfig, McpServerDataConfig } from '../types/index.js';
import { getCorsHeaders } from './cors.js';
import { createHttpPolicy } from './http.js';

/**
 * The 2.0/2.1 config for the web-standard request handler: pre-loaded data
 * plus a CORS override.
 *
 * @deprecated Since 2.2. Pass `{ artifacts }` (see {@link WebRequestHandlerConfig}).
 * Removed in 3.0.
 */
export interface WebRequestAdapterConfig extends McpServerDataConfig {
  /** CORS origin to allow. Defaults to '*' (all origins). */
  corsOrigin?: string;
}

/**
 * Config for the web-standard request handler: `{ artifacts }` (the contents
 * of `bundle.json`) plus a CORS override, or the deprecated
 * {@link WebRequestAdapterConfig}.
 */
export type WebRequestHandlerConfig =
  | (McpServerBundleConfig & {
      /** CORS origin to allow. Defaults to '*' (all origins). */
      corsOrigin?: string;
    })
  | WebRequestAdapterConfig;

/**
 * Create a web-standard `(request: Request) => Promise<Response>` handler for
 * the MCP server, suitable for any web-standard runtime (Cloudflare Workers,
 * modern Netlify functions, Deno, Bun, etc).
 *
 * `OPTIONS` answers the CORS preflight, `GET` initializes and returns the
 * server status, `POST` carries MCP, and anything else gets a 405.
 */
export function createWebRequestHandler(
  config: WebRequestHandlerConfig
): (request: Request) => Promise<Response> {
  const { corsOrigin, ...serverConfig } = config;
  let server: McpDocsServer | null = null;

  return createHttpPolicy({
    // Created on first use, so module scope stays cheap in a Worker.
    getServer: async () => (server ??= new McpDocsServer(serverConfig)),
    corsHeaders: getCorsHeaders(corsOrigin),
  });
}
