/**
 * Adapter entry point for docusaurus-plugin-mcp-server/adapters
 *
 * `createWebRequestHandler` is the web-standard handler for any serverless or
 * edge runtime; `createNodeServer`/`createNodeHandler` run a local-dev server.
 */

export {
  createWebRequestHandler,
  createNodeServer,
  createNodeHandler,
  type NodeServerOptions,
  type WebRequestAdapterConfig,
} from './adapters/index.js';
