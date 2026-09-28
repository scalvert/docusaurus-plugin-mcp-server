# docusaurus-plugin-mcp-server

![CI Build](https://github.com/scalvert/docusaurus-plugin-mcp-server/actions/workflows/ci.yml/badge.svg)
[![npm version](https://badge.fury.io/js/docusaurus-plugin-mcp-server.svg)](https://badge.fury.io/js/docusaurus-plugin-mcp-server)
[![License](https://img.shields.io/npm/l/docusaurus-plugin-mcp-server.svg)](https://github.com/scalvert/docusaurus-plugin-mcp-server/blob/main/LICENSE)

A Docusaurus plugin that exposes an [MCP (Model Context Protocol)](https://modelcontextprotocol.io/) server endpoint, allowing AI agents like Claude, Cursor, and other MCP-compatible tools to search and retrieve your documentation.

The server speaks MCP [2026-07-28](https://modelcontextprotocol.io/specification/2026-07-28) and still serves clients on 2025-era revisions (the `initialize` handshake) from the same endpoint. It can also serve [Agent Skills](#serving-agent-skills-over-mcp) that teach agents how to use your docs tools.

> Upgrading from 1.x? See [Upgrading to 2.0](#upgrading-to-20).

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
import skills from '../build/mcp/skills.json';

export default {
  fetch: createWebRequestHandler({
    docs,
    searchIndexData: searchIndex,
    skills,
    name: 'my-docs',
    baseUrl: 'https://docs.example.com',
  }),
};
```

`skills` is optional. Leave it out to serve no [skills](#serving-agent-skills-over-mcp).

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

Search across documentation with relevance ranking. Returns matching documents with URLs, snippets, and relevance scores. See [Search](#search) for how results are ranked.

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

## Serving Agent Skills over MCP

Tool descriptions tell an agent what `docs_search` and `docs_fetch` do, not how to research your docs well. The server can also ship that guidance as [Agent Skills](https://agentskills.io) via the MCP skills extension ([SEP-2640](https://modelcontextprotocol.io/seps/2640-skills-extension), `io.modelcontextprotocol/skills`).

By default the plugin packages one built-in skill, `docs-research`, which covers the search → fetch → cite workflow for your site. Add your own skills (a directory per skill with a `SKILL.md` at its root) and point the plugin at them:

```javascript snippet=readme/snippet-20.js
// docusaurus.config.js
module.exports = {
  plugins: [
    [
      'docusaurus-plugin-mcp-server',
      {
        server: { name: 'my-docs' },
        // Serve the built-in docs-research skill plus every skill in ./mcp-skills
        skills: { dir: 'mcp-skills' },
      },
    ],
  ],
};
```

```text
mcp-skills/
└── api-migration/
    ├── SKILL.md            # YAML frontmatter with name + description, then instructions
    └── references/
        └── v1-to-v2.md
```

At build time the plugin validates every skill (frontmatter `name` must match the directory name; at most 512 files and 16 MiB per skill), precomputes SHA-256 digests, and writes `build/mcp/skills.json`. Invalid skills fail the build with a `SkillValidationError`. Symlinks inside a skill are skipped, and bundled scripts (`.sh`, `.py`, `.js`, ...) are packaged with a warning. Pass it to the handler as `skills` (web) or `skillsPath` (Node). An author skill named `docs-research` replaces the built-in one. To customize it, copy [`skills-builtin/docs-research/`](skills-builtin/docs-research/SKILL.md) from this package into your skills directory and edit it; in the built-in copy, `{{siteTitle}}` is filled in with your site title at build time, so replace it with your own wording. Set `skills: { builtin: false, dir: '...' }` to ship only your own, or `skills: false` to turn skills off.

At runtime the server:

- declares the `io.modelcontextprotocol/skills` extension and implements `skills/list` and `skills/get`
- serves every skill file as a resource at `skill://<name>/<path>` (for example `skill://docs-research/SKILL.md`)
- appends the skill URIs to the server `instructions`, so clients that don't support the extension yet can still find the skills and load them with `resources/read`

Keep skills to markdown. MCP hosts treat served skills as untrusted input and won't run bundled scripts without explicit user approval.

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
| `indexers` | `string[] \| false` | `['local']` | Indexers to run during build. Use `false` to disable. Supports built-in (`'local'`), relative paths, or npm packages. |
| `search` | `string` | `'local'` | Search provider module for runtime queries. Supports built-in (`'local'`), relative paths, or npm packages. |
| `skills` | `{ builtin?: boolean; dir?: string } \| false` | built-in skill only | [Agent Skills](#serving-agent-skills-over-mcp) to package into `skills.json`. `dir` is relative to the site directory. `false` disables skills. |

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

## Search

The built-in `'local'` search needs no external service. At build time it writes `search-index.json`; at runtime `docs_search` answers from that file.

Results are ranked with [BM25+](https://en.wikipedia.org/wiki/Okapi_BM25) over each page's title, route, headings, description, and body:

- **Query words are combined with OR.** A page does not need every word in the query to match; pages with more of the words, rarer words, or matches in more important fields rank higher.
- **The route is indexed.** `/docs/errors/expired-cursor` matches "expired cursor" even if the title says something else.
- **Long pages are not favored.** Scores are normalized by field length, so a changelog that mentions every topic does not outrank the page about the topic.
- **Words are stemmed, accents are folded, and common words are ignored.** A Porter stemmer makes "indexing" match "index" and "route" match "routes"; "deploiement" matches "déploiement"; and "how do I" adds nothing to a query. Words of three or more letters also match as prefixes, so "auth" finds "authentication".

Tokenization and stemming are fixed, so the index built at `docusaurus build` always matches the one queried at runtime. Field boosts apply at query time and can be changed on the server config without a rebuild:

```javascript snippet=readme/snippet-21.js
createWebRequestHandler({
  docs,
  searchIndexData: searchIndex,
  name: 'my-docs',
  // Defaults: title 3, slug 3, headings 2, description 1.5, content 1
  localSearch: { fieldBoosts: { headings: 3 } },
});
```

The built-in search is tuned for English. For other languages, or to use a hosted search service, write a [custom search provider](#searchprovider).

### Measuring search quality

`evaluateSearch` runs labeled queries against any search provider and reports how often the right page comes back near the top. Use it to compare providers, or to guard ranking in CI after `docusaurus build`:

```javascript snippet=readme/snippet-22.js
import { loadSearchProvider, evaluateSearch } from 'docusaurus-plugin-mcp-server';

const provider = await loadSearchProvider('local');
await provider.initialize(
  { baseUrl: 'https://docs.example.com', serverName: 'eval', serverVersion: '0', outputDir: '' },
  { docsPath: 'build/mcp/docs.json', indexPath: 'build/mcp/search-index.json' }
);

const report = await evaluateSearch(provider, [
  { query: 'install the CLI', expected: ['/docs/installation'] },
  { query: 'rotate an API token', expected: ['/docs/auth/tokens', '/docs/auth/rotation'] },
]);

console.log(report.hitsAt[3], '/', report.total, 'in the top 3; MRR', report.mrr.toFixed(2));
```

`expected` lists every page that fully answers the query, as routes or full URLs. `hitsAt[k]` counts queries whose first correct page ranked at or above `k` (defaults: 1, 3, 5), and `mrr` is the mean reciprocal rank of that page (1.0 means it was always first). `report.cases` has each query's rank and returned routes, for finding the misses.

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
        // Run both the built-in local search indexer and a custom one
        indexers: ['local', './my-algolia-indexer.js'],
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
| `skillsPath` | `string` | No | Path to `skills.json` (file mode). Omit to serve no skills |
| `skills` | `object` | No | Pre-loaded `skills.json` (data mode). Omit to serve no skills |
| `name` | `string` | Yes | Server name |
| `version` | `string` | No | Server version |
| `baseUrl` | `string` | No | Base URL for full page URLs in responses |
| `instructions` | `string` | No | Instructions describing how to use the server, surfaced to MCP clients in the `server/discover` (2026-07-28) or `initialize` (2025-era) result. When skills are served, their URIs are appended |
| `tools` | `object` | No | Per-tool overrides. Supports `docs_search.description` and `docs_fetch.description` to customize tool descriptions |
| `search` | `string \| SearchProvider` | No | Search provider. Default: the built-in `'local'` search |
| `localSearch` | `{ fieldBoosts?: {...} }` | No | Field boosts for the built-in search. See [Search](#search) |

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
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'

# Search documentation
curl -X POST https://docs.example.com/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
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

**Build Time:** During `docusaurus build`, the plugin's `postBuild` hook processes all rendered HTML pages, extracts content, converts to markdown, builds a search index, and outputs artifacts to `build/mcp/`.

**Runtime:** A serverless function loads the pre-built artifacts and handles MCP JSON-RPC requests from AI agents. The server is stateless (MCP 2026-07-28 has no sessions), so any instance can answer any request, and list/read results carry cache hints (`ttlMs` 5 minutes, `cacheScope: public`) because content only changes on redeploy. All indexing happens at build time.

## Features

- **Full-text Search** - BM25-ranked local search, with no external service
- **Page Retrieval** - Get complete page content as clean markdown
- **MCP 2026-07-28, backward compatible** - Stateless modern protocol plus 2025-era clients on the same endpoint
- **Agent Skills** - Ships a docs-research skill (and yours) over the MCP skills extension
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
  skillsPath: './build/mcp/skills.json',
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

  // Provider loaders (built-in 'local' or custom indexers/providers)
  loadIndexer,
  loadSearchProvider,

  // The built-in local search, for passing an instance as `search`
  LocalSearchIndexer,
  LocalSearchProvider,

  // Measure how well a search provider ranks the right pages
  evaluateSearch,

  // Resolve the MCP endpoint URL the install button uses
  resolveServerUrl,

  // Package Agent Skills into a skills.json artifact (outside the plugin)
  buildSkillsArtifact,

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

## Upgrading to 2.0

2.0 moves to the MCP TypeScript SDK v2 (`@modelcontextprotocol/server`) and the 2026-07-28 protocol revision.

**Clients:** nothing to do. Clients on 2026-07-28 are served statelessly. Clients on 2025-era revisions (`initialize` handshake) still get plain JSON responses from the same endpoint. When skills are served, all clients also see a `resources` capability, the `skill://` resources, and a short list of skill URIs appended to `instructions`.

**What changed for you:**

- **Node.js >= 22 is required.** Node 20 reached end of life on 2026-04-30. Node 22 is tested along with 24 and 26.
- **zod >= 4.2 is required.** The v2 SDK drops zod 3, and zod 4.2 or later is needed for tool schema descriptions to reach clients.
- **`docsSearchTool.inputSchema` and `docsFetchTool.inputSchema` are now `z.object(...)` schemas.** The raw shapes are still exported as `docsSearchInputSchema` and `docsFetchInputSchema`.
- **Calling an unknown tool now returns a JSON-RPC error (`-32602`)** instead of a tool result with `isError: true`.
- **2025-era clients see two small differences in responses.** `initialize` now reports `tools.listChanged: false`, which is accurate: the tool list is fixed per deploy and the server never sends list-changed notifications. Tool `inputSchema`s now declare JSON Schema 2020-12 (`$schema`) instead of draft-07.
- **Skills are on by default.** The build now also writes `build/mcp/skills.json`. Pass it to your handler as `skills` or `skillsPath` to serve it, or set `skills: false` in the plugin options to skip it.
- **CORS headers changed.** Both the web handler and the Node server now allow `Content-Type, Accept, Authorization, MCP-Protocol-Version, Mcp-Method, Mcp-Name, Mcp-Session-Id, Last-Event-ID` and expose `MCP-Protocol-Version, Mcp-Session-Id`. In 1.x the web handler allowed only `Content-Type`, the Node server only `Content-Type, Authorization`, and neither exposed any headers.
- **Built-in search is now `'local'` (BM25) instead of `'flexsearch'`.** Ranking is much better on natural queries (see [Search](#search)), and `search-index.json` is far smaller. To upgrade:
  - Rebuild the site. A 1.x `search-index.json` is rejected with a message to rebuild, rather than returning no results.
  - Replace `'flexsearch'` with `'local'` in `indexers` and `search`, or omit them to get the default. `'flexsearch'` now throws.
  - Remove the `flexsearch` plugin and server option. The new search has no build-time tuning; to change ranking, set `localSearch.fieldBoosts` on the server config. `fieldWeights` keys carry over, plus `slug`, but the values are BM25 boosts rather than the 1.x position weights, so start from the defaults instead of copying old values.
  - Rename the type `FlexSearchConfig` to `LocalSearchConfig` and `BuiltinIndexerOptions` to `BuiltinSearchOptions`. `loadIndexer` no longer takes a second argument.
  - `LocalSearchIndexer` and `LocalSearchProvider` are now exported, for passing a provider instance directly (`search: new LocalSearchProvider()`).

## Requirements

- Node.js >= 22
- Docusaurus 3.x
- zod >= 4.2

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
