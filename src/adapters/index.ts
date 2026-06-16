/**
 * Adapters for serving the MCP server
 *
 * `createWebRequestHandler` is the web-standard handler for any serverless or
 * edge runtime (Cloudflare Workers, modern Netlify functions, Vercel Edge,
 * Deno, Bun). `createNodeServer`/`createNodeHandler` provide a local-development
 * server over Node's `http` module.
 */

export {
  createWebRequestHandler,
  type WebRequestAdapterConfig,
  // Deprecated aliases, kept for one release.
  createCloudflareHandler,
  type CloudflareAdapterConfig,
} from './web-request.js';
export { createNodeServer, createNodeHandler } from './node.js';
export type { NodeServerOptions } from './node.js';
