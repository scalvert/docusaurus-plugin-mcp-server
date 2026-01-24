/**
 * Adapter file generator
 *
 * Generates platform-specific adapter files for deploying the MCP server.
 */

export type Platform = 'vercel' | 'netlify' | 'cloudflare';

export interface GeneratorOptions {
  /** Target platform */
  platform: Platform;
  /** Server name */
  name: string;
  /** Base URL for the documentation site */
  baseUrl: string;
  /** Output path for the generated files (defaults to current directory) */
  outputPath?: string;
}

export interface GeneratedFile {
  /** Relative path for the file */
  path: string;
  /** File contents */
  content: string;
  /** Description of the file */
  description: string;
}

/**
 * Generate adapter files for a specific platform
 */
export function generateAdapterFiles(options: GeneratorOptions): GeneratedFile[] {
  const { platform, name, baseUrl } = options;

  switch (platform) {
    case 'vercel':
      return generateVercelFiles(name, baseUrl);
    case 'netlify':
      return generateNetlifyFiles(name, baseUrl);
    case 'cloudflare':
      return generateCloudflareFiles(name, baseUrl);
    default:
      throw new Error(`Unknown platform: ${platform}`);
  }
}

function generateVercelFiles(name: string, baseUrl: string): GeneratedFile[] {
  return [
    {
      path: 'api/mcp.js',
      description: 'Vercel serverless function for MCP server',
      content: `/**
 * Vercel API route for MCP server
 * Deploy to Vercel and this will be available at /api/mcp
 */

const { createVercelHandler } = require('docusaurus-plugin-mcp-server/adapters');
const path = require('path');

const projectRoot = path.join(__dirname, '..');

module.exports = createVercelHandler({
  docsPath: path.join(projectRoot, 'build/mcp/docs.json'),
  indexPath: path.join(projectRoot, 'build/mcp/search-index.json'),
  name: '${name}',
  version: '1.0.0',
  baseUrl: '${baseUrl}',
});
`,
    },
    {
      path: 'vercel.json',
      description: 'Vercel configuration (merge with existing if present)',
      content: `{
  "functions": {
    "api/mcp.js": {
      "includeFiles": "build/mcp/**"
    }
  },
  "rewrites": [
    {
      "source": "/mcp",
      "destination": "/api/mcp"
    }
  ]
}
`,
    },
  ];
}

function generateNetlifyFiles(name: string, baseUrl: string): GeneratedFile[] {
  return [
    {
      path: 'netlify/functions/mcp.js',
      description: 'Netlify serverless function for MCP server',
      content: `/**
 * Netlify function for MCP server
 * Deploy to Netlify and this will be available at /.netlify/functions/mcp
 */

const { createNetlifyHandler } = require('docusaurus-plugin-mcp-server/adapters');
const path = require('path');

const projectRoot = path.join(__dirname, '../..');

exports.handler = createNetlifyHandler({
  docsPath: path.join(projectRoot, 'build/mcp/docs.json'),
  indexPath: path.join(projectRoot, 'build/mcp/search-index.json'),
  name: '${name}',
  version: '1.0.0',
  baseUrl: '${baseUrl}',
});
`,
    },
    {
      path: 'netlify.toml',
      description: 'Netlify configuration (merge with existing if present)',
      content: `[build]
  publish = "build"
  command = "npm run build"

[functions]
  directory = "netlify/functions"
  included_files = ["build/mcp/**"]

[[redirects]]
  from = "/mcp"
  to = "/.netlify/functions/mcp"
  status = 200
`,
    },
  ];
}

function generateCloudflareFiles(name: string, baseUrl: string): GeneratedFile[] {
  return [
    {
      path: 'workers/mcp.js',
      description: 'Cloudflare Worker for MCP server',
      content: `/**
 * Cloudflare Worker for MCP server
 *
 * Note: This requires bundling docs.json and search-index.json with the worker,
 * or using Cloudflare KV/R2 for storage.
 *
 * For bundling, use wrangler with custom build configuration.
 */

import { createCloudflareHandler } from 'docusaurus-plugin-mcp-server/adapters';

// Option 1: Import bundled data (requires bundler configuration)
// import docs from '../build/mcp/docs.json';
// import searchIndex from '../build/mcp/search-index.json';

// Option 2: Use KV bindings (requires KV namespace configuration)
// const docs = await env.MCP_KV.get('docs', { type: 'json' });
// const searchIndex = await env.MCP_KV.get('search-index', { type: 'json' });

export default {
  fetch: createCloudflareHandler({
    name: '${name}',
    version: '1.0.0',
    baseUrl: '${baseUrl}',
    // docsPath and indexPath are used for file-based loading
    // For Workers, you'll need to configure data loading differently
    docsPath: './mcp/docs.json',
    indexPath: './mcp/search-index.json',
  }),
};
`,
    },
    {
      path: 'wrangler.toml',
      description: 'Cloudflare Wrangler configuration',
      content: `name = "${name}-mcp"
main = "workers/mcp.js"
compatibility_date = "2024-01-01"

# Uncomment to use KV for storing docs
# [[kv_namespaces]]
# binding = "MCP_KV"
# id = "your-kv-namespace-id"

# Static assets (the Docusaurus build)
# [site]
# bucket = "./build"
`,
    },
  ];
}
