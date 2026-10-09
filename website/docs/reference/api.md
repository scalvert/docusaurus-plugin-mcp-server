---
title: API
description: Everything the package exports, by entry point.
---

# API

The package is ESM-only and has four entry points:

| Import | Use it for | Runs on |
| --- | --- | --- |
| `docusaurus-plugin-mcp-server` | The Docusaurus plugin, the server class, providers, utilities | Node (build time) |
| `docusaurus-plugin-mcp-server/adapters` | `createWebRequestHandler` for serverless and edge runtimes | Any web-standard runtime. Imports no Node built-ins |
| `docusaurus-plugin-mcp-server/adapters/node` | The Node server and handler, reading the bundle from disk | Node |
| `docusaurus-plugin-mcp-server/theme` | The install button, registry helpers, and `ForAgents`/`ForHumans` | The browser (your Docusaurus theme) |

The `ArtifactBundle` type is exported from the main, `adapters`, and `adapters/node` entry points.

## Main exports

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

  // Measure how well a search provider ranks the right pages (experimental)
  evaluateSearch,

  // Resolve the MCP endpoint URL the install button uses
  resolveServerUrl,

  // Package Agent Skills into a skills.json artifact outside the plugin (experimental)
  buildSkillsArtifact,

  // Default plugin options
  DEFAULT_PLUGIN_OPTIONS,
} from 'docusaurus-plugin-mcp-server';
```

- `evaluateSearch` is documented in [Measuring search quality](../guides/search.md#measuring-search-quality).
- `ContentIndexer`, `SearchRanker`, and `SearchProvider` are documented in [Custom providers](../guides/custom-providers.md).

### `resolveServerUrl`

Derives the public MCP endpoint URL, with the same logic the plugin uses for the install button and global data. Use it in custom theme UI that has to agree with the plugin. The `ResolveServerUrlInput` and `ServerUrlBase` types are exported too.

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
| --- | --- | --- |
| `siteUrl` | `string` | Docusaurus `siteConfig.url` |
| `baseUrl` | `string` | Docusaurus `siteConfig.baseUrl` |
| `outputDir` | `string` | Plugin `outputDir` (default `'mcp'`) |
| `server.url` | `string` | Explicit endpoint. When set, `urlBase` is ignored |
| `server.urlBase` | `ServerUrlBase` | `'origin'` (default) → `{siteUrl}/{outputDir}`; `'site'` → under `baseUrl` |

`ServerUrlBase` is `'origin' | 'site'`, matching the `server.url` / `server.urlBase` plugin options.

## Adapter exports

```javascript snippet=readme/snippet-18.js
import { createWebRequestHandler } from 'docusaurus-plugin-mcp-server/adapters';
import {
  createNodeServer,
  createNodeHandler,
  readArtifactBundle,
} from 'docusaurus-plugin-mcp-server/adapters/node';
```

- **`createWebRequestHandler(options)`** returns a web-standard `(request: Request) => Promise<Response>` handler. Pass `{ artifacts }`. See the [deployment guides](../deploy/index.md).
- **`createNodeServer(options)`** returns an `http.Server` ready to `.listen()`, for local development and simple hosting.
- **`createNodeHandler(options)`** returns an `(req, res)` handler for `http.createServer()` and Connect-style frameworks such as Express. Mount it for all methods: `GET` is the status check and `OPTIONS` is the CORS preflight. If a body parser such as `express.json()` has already read the request, the handler uses its `req.body`:

  ```javascript snippet=readme/snippet-23.js
  import express from 'express';
  import { createNodeHandler } from 'docusaurus-plugin-mcp-server/adapters/node';

  const app = express();
  app.use(express.json());
  app.all('/mcp', createNodeHandler({ artifactsDir: './build/mcp' }));
  app.listen(3456);
  ```

- **`readArtifactBundle(dir)`** reads and validates the artifact bundle in a build directory (`bundle.json`, or the 2.0/2.1 per-file layout). Pass the result as `artifacts` to `McpDocsServer`, or as `initData.bundle` to a search provider you drive yourself.

All of them take the [server options](./server-options.md).

## Theme exports

```tsx snippet=readme/snippet-19.tsx
import {
  McpInstallButton,
  type McpInstallButtonProps,
  ForAgents,
  ForHumans,
  type AudienceProps,
  useMcpRegistry,
  createDocsRegistry,
  createDocsRegistryOptions,
  type McpConfig,
} from 'docusaurus-plugin-mcp-server/theme';
```

- **`McpInstallButton`** is the dropdown readers use to install the server in their AI tool. See [Install button](../guides/install-button.md).
- **`ForAgents`** and **`ForHumans`** mark page content for one audience: agents get `ForAgents` content and not `ForHumans` content, and people see the opposite. See [Writing for agents](../guides/writing-for-agents.md).
- **`useMcpRegistry()`** is a React hook that returns the MCP config registry from the plugin's global data, or `undefined` if the plugin isn't installed.
- **`createDocsRegistry(config)`** creates a preconfigured `MCPConfigRegistry` for a docs server.
- **`createDocsRegistryOptions(config)`** returns the registry options without creating the registry.
- **`McpConfig`** is the type `{ serverUrl: string; serverName: string }`.
