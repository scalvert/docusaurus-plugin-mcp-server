/**
 * Adapter entry point for docusaurus-plugin-mcp-server/adapters
 *
 * This module provides platform-specific adapters for deploying the MCP server.
 */

export {
  createVercelHandler,
  createNetlifyHandler,
  createCloudflareHandler,
  generateAdapterFiles,
  type VercelRequest,
  type VercelResponse,
  type NetlifyEvent,
  type NetlifyContext,
} from './adapters/index.js';

export type { Platform, GeneratorOptions, GeneratedFile } from './adapters/generator.js';
export type { CloudflareAdapterConfig } from './adapters/cloudflare.js';
