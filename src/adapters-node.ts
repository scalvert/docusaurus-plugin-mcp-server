/**
 * Node entry point for `docusaurus-plugin-mcp-server/adapters/node`.
 *
 * Node `http`-based server/handler for local development. Kept separate from
 * the web-standard `./adapters` entry so importing the edge handler never pulls
 * in Node built-ins (`http`, `fs`).
 */

export { createNodeServer, createNodeHandler, type NodeServerOptions } from './adapters/node.js';
