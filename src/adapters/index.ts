/**
 * Platform adapters for deploying the MCP server
 *
 * These adapters provide pre-configured server handlers for different
 * deployment platforms (Vercel, Netlify, Cloudflare Workers).
 */

export { createVercelHandler, type VercelRequest, type VercelResponse } from './vercel.js';
export { createNetlifyHandler, type NetlifyEvent, type NetlifyContext } from './netlify.js';
export { createCloudflareHandler } from './cloudflare.js';
export { generateAdapterFiles } from './generator.js';
