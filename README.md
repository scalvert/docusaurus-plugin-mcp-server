# docusaurus-plugin-mcp-server

![CI Build](https://github.com/scalvert/docusaurus-plugin-mcp-server/actions/workflows/ci.yml/badge.svg)
[![npm version](https://badge.fury.io/js/docusaurus-plugin-mcp-server.svg)](https://badge.fury.io/js/docusaurus-plugin-mcp-server)
[![License](https://img.shields.io/npm/l/docusaurus-plugin-mcp-server.svg)](https://github.com/scalvert/docusaurus-plugin-mcp-server/blob/main/LICENSE)

A Docusaurus plugin that exposes an [MCP (Model Context Protocol)](https://modelcontextprotocol.io/) server endpoint, allowing AI agents like Claude, Cursor, and other MCP-compatible tools to search and retrieve your documentation.

## Installation

```bash
npm install docusaurus-plugin-mcp-server
```

## Quick Start

### 1. Add the Plugin

```javascript snippet=readme/snippet-01.js
// docusaurus.config.js
module.exports = {
  plugins: [
    [
      'docusaurus-plugin-mcp-server',
      {
        server: {
          name: 'my-docs',
          version: '1.0.0',
        },
      },
    ],
  ],
};
```

### 2. Create the API Endpoint

The MCP server runs on any web-standard serverless or edge runtime — Cloudflare Workers, modern Netlify functions, Vercel Edge, Deno, Bun. Import the build artifacts and pass them to `createWebRequestHandler`, which returns a standard `(request: Request) => Promise<Response>`. (These runtimes can't read the filesystem, so the data is imported as modules rather than loaded from disk.)

```javascript snippet=readme/snippet-06.js
import { createWebRequestHandler } from 'docusaurus-plugin-mcp-server/adapters';
import docs from '../build/mcp/docs.json';
import searchIndex from '../build/mcp/search-index.json';

export default {
  fetch: createWebRequestHandler({
    docs,
    searchIndexData: searchIndex,
    name: 'my-docs',
    baseUrl: 'https://docs.example.com',
  }),
};
```

The `export default { fetch }` form works on Cloudflare Workers, Deno, and Bun. Other runtimes use their own entry convention (e.g. modern Netlify functions `export default async (request) => Response`) — the handler is identical, only the export wrapper differs.

The handler is unauthenticated and allows all origins (`Access-Control-Allow-Origin: *`) by default, since a docs MCP endpoint is meant to be public — pass `corsOrigin` to restrict it.

For local development, run the server over Node's `http` with `createNodeServer` from `docusaurus-plugin-mcp-server/adapters/node` (see [Adapter Exports](#adapter-exports)).

### 3. Build and Deploy

```bash
npm run build
# Deploy to your platform
```

### 4. Connect Your AI Tool

**Claude Code:**

```bash
claude mcp add --transport http my-docs https://docs.example.com/mcp
```

**Cursor / VS Code:**

```json snippet=readme/snippet-07.json
{
  "mcpServers": {
    "my-docs": {
      "url": "https://docs.example.com/mcp"
    }
  }
}
```

### 5. Add an Install Button (Optional)

Add a dropdown button to your docs site so users can easily install the MCP server in their AI tool:

```tsx snippet=readme/snippet-08.tsx
import { McpInstallButton } from 'docusaurus-plugin-mcp-server/theme';

function NavbarItems() {
  return <McpInstallButton serverUrl="https://docs.example.com/mcp" serverName="my-docs" />;
}
```

The button shows a dropdown with copy-to-clipboard configurations for all supported MCP clients.

| Light Mode | Dark Mode |
|:----------:|:---------:|
| ![MCP Install Button - Light Mode](./img/mcp-button-light.png) | ![MCP Install Button - Dark Mode](./img/mcp-button-dark.png) |

**Props:**

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `serverUrl` | `string` | (plugin config) | MCP server endpoint URL. Falls back to the plugin's global data when omitted |
| `serverName` | `string` | (plugin config) | MCP server name. Falls back to the plugin's global data when omitted |
| `label` | `string` | (none) | Button label. If omitted, shows only the MCP icon |
| `headerText` | `string` | `"Choose your AI tool:"` | Text shown at the top of the dropdown |
| `className` | `string` | `""` | Optional CSS class |
| `clients` | `ClientId[]` | All HTTP-capable | Which clients to show |

## MCP Tools

The server exposes two tools for AI agents:

### `docs_search`

Search across documentation with relevance ranking. Returns matching documents with URLs, snippets, and relevance scores.

```json snippet=readme/snippet-09.json
{
  "name": "docs_search",
  "arguments": {
    "query": "authentication",
    "limit": 16
  }
}
```

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `query` | `string` | required | Search query |
| `limit` | `number` | `16` | Max results (1-20) |

**Response includes:**

- Full URL for each result (use with `docs_fetch`)
- Title and relevance score
- Snippet of matching content
- Matching headings

### `docs_fetch`

Retrieve full page content as markdown. Use this after searching to get the complete content of a specific page.

```json snippet=readme/snippet-10.json
{
  "name": "docs_fetch",
  "arguments": {
    "url": "https://docs.example.com/docs/authentication"
  }
}
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `url` | `string` | Full URL of the page (from search results) |

**Response includes:**

- Page title and description
- Table of contents with anchor links
- Full markdown content

## Plugin Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `outputDir` | `string` | `'mcp'` | Output directory for MCP artifacts (relative to build dir) |
| `contentSelectors` | `string[]` | `['article', 'main', ...]` | CSS selectors for finding content |
| `excludeSelectors` | `string[]` | `['nav', 'header', ...]` | CSS selectors for elements to remove |
| `minContentLength` | `number` | `50` | Minimum content length to consider a page valid |
| `server.name` | `string` | `'docs-mcp-server'` | Name of the MCP server |
| `server.version` | `string` | `'1.0.0'` | Version of the MCP server |
| `server.url` | `string` | (derived) | Explicit MCP HTTP endpoint URL for the install button |
| `server.urlBase` | `'origin' \| 'site'` | `'origin'` | How to derive the MCP URL when `server.url` is not set. `'origin'` → `{siteUrl}/{outputDir}`; `'site'` → under Docusaurus `baseUrl` |
| `excludeRoutes` | `string[]` | `['/404*', '/search*']` | Routes to exclude (glob patterns) |
| `indexers` | `string[] \| false` | `['flexsearch']` | Indexers to run during build. Use `false` to disable. Supports built-in (`'flexsearch'`), relative paths, or npm packages. |
| `search` | `string` | `'flexsearch'` | Search provider module for runtime queries. Supports built-in (`'flexsearch'`), relative paths, or npm packages. |
| `flexsearch` | `FlexSearchConfig` | (tuned defaults) | Tuning for the built-in FlexSearch index (`tokenize`, `resolution`, `context`, `fieldWeights`). Must be the same at build and runtime, or the index deserializes wrong. |

Build-time options control artifact generation and the install-button URL (`server.url` / `server.urlBase`). Runtime-only options such as `instructions`, `tools`, and `baseUrl` belong on the adapter/handler config — see [Server Configuration](#server-configuration).

### Default Selectors

**Content selectors** (in priority order):

```javascript snippet=readme/snippet-11.js
['article', 'main', '.main-wrapper', '[role="main"]'];
```

**Exclude selectors**:

```javascript snippet=readme/snippet-12.js
[
  'nav',
  'header',
  'footer',
  'aside',
  '[role="navigation"]',
  '[role="banner"]',
  '[role="contentinfo"]',
];
```

## Custom Providers

The plugin uses a two-phase provider model: **indexers** run at build time to process documents, and **search providers** handle queries at runtime. Both are pluggable.

### ContentIndexer

Implement `ContentIndexer` to push documents to an external system during build:

```typescript snippet=readme/snippet-13.ts
import type { ContentIndexer, ProviderContext, ProcessedDoc } from 'docusaurus-plugin-mcp-server';

export default class AlgoliaIndexer implements ContentIndexer {
  readonly name = 'algolia';

  shouldRun(): boolean {
    return process.env.ALGOLIA_SYNC === 'true';
  }

  async initialize(context: ProviderContext): Promise<void> {
    console.log(`[Algolia] Initializing for ${context.baseUrl}`);
  }

  async indexDocuments(docs: ProcessedDoc[]): Promise<void> {
    // Push docs to Algolia
  }

  async finalize(): Promise<Map<string, unknown>> {
    // No local artifacts needed
    return new Map();
  }
}
```

### SearchProvider

Implement `SearchProvider` to delegate runtime search to an external service:

```typescript snippet=readme/snippet-14.ts
import type {
  SearchProvider,
  ProviderContext,
  SearchOptions,
  SearchResult,
} from 'docusaurus-plugin-mcp-server';

export default class GleanSearchProvider implements SearchProvider {
  readonly name = 'glean';

  private apiEndpoint = process.env.GLEAN_API_ENDPOINT!;
  private apiToken = process.env.GLEAN_API_TOKEN!;

  async initialize(context: ProviderContext): Promise<void> {
    if (!this.apiEndpoint || !this.apiToken) {
      throw new Error('GLEAN_API_ENDPOINT and GLEAN_API_TOKEN required');
    }
  }

  isReady(): boolean {
    return !!this.apiEndpoint && !!this.apiToken;
  }

  async search(query: string, options?: SearchOptions): Promise<SearchResult[]> {
    // Call Glean Search API and transform results
    return [];
  }
}
```

### Configuring Custom Providers

```javascript snippet=readme/snippet-15.js
// docusaurus.config.js
module.exports = {
  plugins: [
    [
      'docusaurus-plugin-mcp-server',
      {
        // Run both the built-in FlexSearch indexer and a custom one
        indexers: ['flexsearch', './my-algolia-indexer.js'],
        // Use a custom search provider at runtime
        search: '@myorg/glean-search',
      },
    ],
  ],
};
```

## Server Configuration

These options apply to `createWebRequestHandler`, `createNodeServer`, and `createNodeHandler` — where the MCP server actually runs. They are **not** `McpServerPluginOptions`; the Docusaurus plugin only builds `docs.json` and the search index at build time.

| Option | Type | Required | Description |
|--------|------|----------|-------------|
| `docsPath` | `string` | Yes* | Path to `docs.json` |
| `indexPath` | `string` | Yes* | Path to `search-index.json` |
| `docs` | `object` | Yes* | Pre-loaded docs (web handler) |
| `searchIndexData` | `object` | Yes* | Pre-loaded search index (web handler) |
| `name` | `string` | Yes | Server name |
| `version` | `string` | No | Server version |
| `baseUrl` | `string` | No | Base URL for full page URLs in responses |
| `instructions` | `string` | No | Instructions describing how to use the server, surfaced to MCP clients in the `initialize` response |
| `tools` | `object` | No | Per-tool overrides. Supports `docs_search.description` and `docs_fetch.description` to customize tool descriptions |

*Use file paths (`createNodeServer`, local dev) or pre-loaded data (`createWebRequestHandler`, serverless/edge).

Example with extended configuration:

```javascript
export default {
  fetch: createWebRequestHandler({
    docs,
    searchIndexData: searchIndex,
    name: 'my-docs',
    baseUrl: 'https://docs.example.com',
    instructions: 'Search the Acme product docs. Use docs_search to find pages, then docs_fetch for full content.',
    tools: {
      docs_search: { description: 'Search the Acme product documentation.' },
      docs_fetch: { description: 'Fetch the full markdown of an Acme docs page.' },
    },
  }),
};
```

## Verifying Your Build

After running `npm run build`, use the included CLI to verify the MCP output:

```bash
npx docusaurus-mcp-verify
```

This checks that:

- All required files exist (`docs.json`, `search-index.json`, `manifest.json`)
- Document structure is valid
- The MCP server can initialize and load the content

You can specify a custom build directory:

```bash
npx docusaurus-mcp-verify ./custom-build
```

Example output:

```sh
🔍 MCP Build Verification
==================================================
Build directory: /path/to/your/project/build

📁 Checking build output...
   ✓ Found 42 documents
   ✓ All required files present
   ✓ File structure valid

🚀 Testing MCP server...
   ✓ Server initialized with 42 documents

✅ All checks passed!
```

## Testing the Endpoint

The easiest way to test your MCP server is with the official MCP Inspector:

```bash
npx @modelcontextprotocol/inspector
```

This opens a visual interface where you can:

- Connect to your server URL
- Browse available tools
- Execute tool calls interactively
- View responses in a formatted display

Alternatively, test with curl:

```bash
# List available tools
curl -X POST https://docs.example.com/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'

# Search documentation
curl -X POST https://docs.example.com/mcp \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc":"2.0",
    "id":2,
    "method":"tools/call",
    "params":{
      "name":"docs_search",
      "arguments":{"query":"getting started"}
    }
  }'
```

## How It Works

![How It Works](./img/how-it-works.svg)

The plugin operates in two phases:

**Build Time:** During `docusaurus build`, the plugin's `postBuild` hook processes all rendered HTML pages, extracts content, converts to markdown, builds a FlexSearch index, and outputs artifacts to `build/mcp/`.

**Runtime:** A serverless function loads the pre-built artifacts and handles MCP JSON-RPC requests from AI agents. The server is stateless and fast since all indexing happens at build time.

## Features

- **Full-text Search** - FlexSearch-powered search with relevance ranking
- **Page Retrieval** - Get complete page content as clean markdown
- **Runs Anywhere** - One web-standard handler (`createWebRequestHandler`) for any serverless/edge runtime — Cloudflare Workers, modern Netlify functions, Vercel Edge, Deno, Bun — plus a Node server (`createNodeServer`) for local development
- **CORS Support** - The web and Node handlers send CORS headers for browser-based clients; restrict with `corsOrigin`
- **Build-time Processing** - Extracts content from rendered HTML, capturing React component output
- **Zero Runtime Docusaurus Dependency** - The MCP server runs independently

## Local Development

Run a local MCP server for testing using the built-in Node adapter:

```javascript snippet=readme/snippet-16.js
// mcp-server.mjs
import { createNodeServer } from 'docusaurus-plugin-mcp-server/adapters/node';

createNodeServer({
  docsPath: './build/mcp/docs.json',
  indexPath: './build/mcp/search-index.json',
  name: 'my-docs',
  baseUrl: 'http://localhost:3000',
}).listen(3456, () => {
  console.log('MCP server at http://localhost:3456');
});
```

The Node adapter handles CORS, preflight requests, and health checks (GET) automatically.

Connect Claude Code:

```bash
claude mcp add --transport http my-docs http://localhost:3456
```

## API Reference

### Main Exports

```javascript snippet=readme/snippet-17.js
import {
  // Docusaurus plugin (also the default export)
  mcpServerPlugin,

  // MCP server class (advanced / custom runtimes)
  McpDocsServer,

  // Tool definitions
  docsSearchTool,
  docsFetchTool,

  // Provider loaders (built-in 'flexsearch' or custom indexers/providers)
  loadIndexer,
  loadSearchProvider,

  // Resolve the MCP endpoint URL the install button uses
  resolveServerUrl,

  // Default plugin options
  DEFAULT_PLUGIN_OPTIONS,
} from 'docusaurus-plugin-mcp-server';
```

### `resolveServerUrl`

Derives the public MCP HTTP endpoint URL — the same logic the plugin uses for the install button and `globalData`. Use this when building custom theme UI that must stay in sync with plugin URL resolution.

Types `ResolveServerUrlInput` and `ServerUrlBase` are also exported from `.`.

```typescript
import { resolveServerUrl, type ResolveServerUrlInput } from 'docusaurus-plugin-mcp-server';

const serverUrl = resolveServerUrl({
  siteUrl: 'https://docs.example.com',
  baseUrl: '/docs/',
  outputDir: 'mcp',
  server: { urlBase: 'site' },
});
// → 'https://docs.example.com/docs/mcp'
```

| Field | Type | Description |
|-------|------|-------------|
| `siteUrl` | `string` | Docusaurus `siteConfig.url` |
| `baseUrl` | `string` | Docusaurus `siteConfig.baseUrl` |
| `outputDir` | `string` | Plugin `outputDir` (default `'mcp'`) |
| `server.url` | `string` | Explicit endpoint; when set, `urlBase` is ignored |
| `server.urlBase` | `ServerUrlBase` | `'origin'` (default) → `{siteUrl}/{outputDir}`; `'site'` → under `baseUrl` |

`ServerUrlBase` is `'origin' | 'site'`. Mirrors the `server.url` / `server.urlBase` plugin options.

### Adapter Exports

```javascript snippet=readme/snippet-18.js
import { createWebRequestHandler } from 'docusaurus-plugin-mcp-server/adapters';
import { createNodeServer, createNodeHandler } from 'docusaurus-plugin-mcp-server/adapters/node';
```

- `createNodeServer(options)` — Creates a complete Node.js HTTP server for local development. Returns an `http.Server` ready to `.listen()`.
- `createNodeHandler(options)` — Creates a request handler function compatible with `http.createServer()`. Use this when you need to integrate with an existing server.

### Theme Exports

```tsx snippet=readme/snippet-19.tsx
import {
  McpInstallButton,
  type McpInstallButtonProps,
  useMcpRegistry,
  createDocsRegistry,
  createDocsRegistryOptions,
  type McpConfig,
} from 'docusaurus-plugin-mcp-server/theme';
```

- `McpInstallButton` — Dropdown button for users to install the MCP server in their AI tool.
- `useMcpRegistry()` — React hook that returns the MCP config registry from plugin global data. Returns `undefined` if the plugin is not installed.
- `createDocsRegistry(config)` — Creates a pre-configured `MCPConfigRegistry` for documentation servers.
- `createDocsRegistryOptions(config)` — Returns registry options without creating the registry.
- `McpConfig` — Type for `{ serverUrl: string; serverName: string }`.

## Requirements

- Node.js >= 20
- Docusaurus 3.x

## License

MIT

<!-- configure-agents:skills start -->

## Agent skills

This repository ships agent skill(s) under `skills/`. Install them into your
AI agent with [`npx skills`](https://github.com/agentskills/agentskills):

```sh
npx skills add -g scalvert/docusaurus-plugin-mcp-server   # global — available in every repo
npx skills add scalvert/docusaurus-plugin-mcp-server      # or scoped to the current repo
```

<!-- configure-agents:skills end -->
