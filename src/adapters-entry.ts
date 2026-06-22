/**
 * Adapter entry point for `docusaurus-plugin-mcp-server/adapters`.
 *
 * `createWebRequestHandler` is the web-standard `(Request) => Promise<Response>`
 * handler for any serverless/edge runtime (Cloudflare Workers, modern Netlify
 * functions, Vercel Edge, Deno, Bun). It imports no Node built-ins.
 *
 * For a local-development server over Node's `http`, import from
 * `docusaurus-plugin-mcp-server/adapters/node`.
 */

export { createWebRequestHandler, type WebRequestAdapterConfig } from './adapters/web-request.js';
