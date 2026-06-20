---
name: "docusaurus-plugin-mcp-server"
description: "Expose a Docusaurus site's docs as an MCP server for AI agents — add the build-time plugin, deploy the MCP endpoint to any web-standard serverless/edge runtime, run it locally, or add the install button. Load when working with docusaurus-plugin-mcp-server or its /adapters or /theme entry points."
---

# docusaurus-plugin-mcp-server

A Docusaurus plugin that, at `docusaurus build`, emits MCP artifacts (`docs.json`, `search-index.json`, `manifest.json`) under `build/mcp/`, plus runtime handlers that serve them as an MCP endpoint (`docs_search` + `docs_fetch`) to AI agents.

## When to use

Load this skill when the task involves:

- Adding/configuring the plugin in `docusaurus.config.js`.
- Standing up the MCP HTTP endpoint — deploying to a serverless/edge runtime (Cloudflare Workers, modern Netlify functions, Vercel Edge, Deno, Bun) or running it locally on Node.
- Adding the `McpInstallButton` to a docs site.
- Writing a custom indexer or search provider.

Trigger imports: `docusaurus-plugin-mcp-server`, `docusaurus-plugin-mcp-server/adapters`, `docusaurus-plugin-mcp-server/theme`.

## Install & import

```bash
npm install docusaurus-plugin-mcp-server
```

ESM-only. Three entry points:

- `docusaurus-plugin-mcp-server` — the plugin (default export) + `McpDocsServer`, provider types, `DEFAULT_PLUGIN_OPTIONS`.
- `docusaurus-plugin-mcp-server/adapters` — runtime handlers: `createWebRequestHandler` (deploy) and `createNodeServer`/`createNodeHandler` (local dev).
- `docusaurus-plugin-mcp-server/theme` — `McpInstallButton`.

Peers: `@docusaurus/core` (and `react`/`react-dom` for the theme button) are optional peer deps; provide them from your Docusaurus app.

## Authoritative API

The authoritative API is the published TypeScript types. Read the `.d.ts` files referenced by `exports` in `package.json` before writing calls — do not guess signatures:

- `.` → `dist/index.d.ts` (plugin options, `McpDocsServer`, provider/`ProcessedDoc` types)
- `./adapters` → `dist/adapters-entry.d.ts` (`WebRequestAdapterConfig`, `NodeServerOptions`, and the shared `McpServerBaseConfig`/`McpServerFileConfig`/`McpServerDataConfig`)
- `./theme` → `dist/theme/index.d.ts` (`McpInstallButton` props)

Config shape in particular (data-vs-file, required fields, `instructions`/`tools` overrides) lives in those types — read them rather than copying field lists.

## Usage patterns

**1. Build step.** Add the plugin to the `plugins` array in `docusaurus.config.js` with a `server.name`. `docusaurus build` then writes `build/mcp/`.

**2. Deploy to a serverless/edge runtime.** Edge/Worker runtimes can't read the filesystem, so import the artifacts as modules and pass them as pre-loaded data to `createWebRequestHandler`, which returns a standard `(request: Request) => Promise<Response>`. The handler is identical across runtimes — only the export wrapper and platform config differ:

```js
import { createWebRequestHandler } from 'docusaurus-plugin-mcp-server/adapters';
import docs from './build/mcp/docs.json';
import searchIndexData from './build/mcp/search-index.json';

const handler = createWebRequestHandler({ docs, searchIndexData, name: 'my-docs', baseUrl: 'https://docs.example.com' });
```

Per-platform glue to scaffold:

- **Cloudflare Workers** — `export default { fetch: handler }`; add a `wrangler.toml` whose `main` is the worker entry, and a `[[rules]] type = "Data"` rule globbing `**/*.json` so the JSON imports bundle.
- **Deno / Bun** — `export default { fetch: handler }` (both honor the `fetch` default export).
- **Modern Netlify functions** — `export default async (request) => handler(request)` (the new web-standard functions API, not the legacy `event`/`context` one).
- **Vercel** — use the Edge runtime: `export const config = { runtime: 'edge' }` and `export default handler`.

**3. Run locally.** `createNodeServer(...)` returns an `http.Server` you `.listen()`; it reads from disk via `docsPath`/`indexPath`. Use `createNodeHandler(...)` to mount into an existing `http.createServer`.

**4. Install button.** Render `McpInstallButton` (from `./theme`) in a navbar component with your `serverUrl`/`serverName`.

## Common mistakes

- **Filesystem paths on edge/Workers.** `docsPath`/`indexPath` only work where there's a filesystem (local Node). On Workers/edge, import the JSON and pass `docs`/`searchIndexData` to `createWebRequestHandler`.
- **Cloudflare JSON imports fail without the Data rule.** Missing `[[rules]] type = "Data"` in `wrangler.toml` makes the `docs.json`/`search-index.json` imports break at deploy.
- **Reaching for removed/renamed handlers.** There is now a *single* generic deploy handler. `createVercelHandler`, `createNetlifyHandler`, and `generateAdapterFiles` were removed. `createCloudflareHandler` still exists as a **deprecated** alias of `createWebRequestHandler` — use the new name.
- **Wrong `baseUrl`.** It must be the site origin plus the Docusaurus `baseUrl` (e.g. `https://example.com/docs/`); otherwise the URLs in search results point to the wrong place.
- **Deploying before building.** The handler needs `build/mcp/*` — run `docusaurus build` first.

## Version notes

Check the installed version with `npm ls docusaurus-plugin-mcp-server`. The adapter surface recently consolidated to one web-standard `createWebRequestHandler`; the legacy `createVercelHandler`/`createNetlifyHandler`/`generateAdapterFiles` are gone and `createCloudflareHandler` is a deprecated alias scheduled for removal — confirm against `dist/adapters-entry.d.ts` for the version you have.
