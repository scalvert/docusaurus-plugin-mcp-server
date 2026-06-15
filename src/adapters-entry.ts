/**
 * Adapter entry point for docusaurus-plugin-mcp-server/adapters
 *
 * This module provides platform-specific adapters for deploying the MCP server.
 */

export {
  createVercelHandler,
  createNetlifyHandler,
  createWebRequestHandler,
  createNodeServer,
  createNodeHandler,
  generateAdapterFiles,
  type VercelRequest,
  type VercelResponse,
  type NetlifyEvent,
  type NetlifyContext,
  type NodeServerOptions,
  type WebRequestAdapterConfig,
  // Deprecated aliases, kept for one release.
  createCloudflareHandler,
  type CloudflareAdapterConfig,
} from './adapters/index.js';

export type { Platform, GeneratorOptions, GeneratedFile } from './adapters/generator.js';
