---
name: "docusaurus-plugin-mcp-server"
description: "Expose a Docusaurus site's docs as an MCP server for AI agents — add the build-time plugin, deploy the MCP endpoint to any web-standard serverless/edge runtime, run it locally, serve Agent Skills over MCP, or add the install button. Load when working with docusaurus-plugin-mcp-server or its /adapters or /theme entry points."
---

# docusaurus-plugin-mcp-server

A Docusaurus plugin that, at `docusaurus build`, writes an artifact bundle (`build/mcp/bundle.json`: documents, search index, skills, manifest; 2.x also writes each as its own file), plus runtime handlers that serve them as an MCP endpoint (`docs_search` + `docs_fetch` tools, and Agent Skills via the `io.modelcontextprotocol/skills` extension) to AI agents. The endpoint speaks MCP 2026-07-28 and still serves 2025-era (`initialize`) clients.

## When to use

Load this skill when the task involves:

- Adding/configuring the plugin in `docusaurus.config.js`.
- Standing up the MCP HTTP endpoint — deploying to a serverless/edge runtime (Cloudflare Workers, modern Netlify functions, Vercel Edge, Deno, Bun) or running it locally on Node.
- Adding the `McpInstallButton` to a docs site.
- Writing a custom indexer or search provider.
- Shipping Agent Skills with the docs (the `skills` plugin option, `skills.json`).

Trigger imports: `docusaurus-plugin-mcp-server`, `docusaurus-plugin-mcp-server/adapters`, `docusaurus-plugin-mcp-server/adapters/node`, `docusaurus-plugin-mcp-server/theme`.

## Install & import

```bash
npm install docusaurus-plugin-mcp-server
```

ESM-only. Four entry points:

- `docusaurus-plugin-mcp-server` — the plugin (default export) + `McpDocsServer`, provider types, `DEFAULT_PLUGIN_OPTIONS`.
- `docusaurus-plugin-mcp-server/adapters` — the web-standard deploy handler `createWebRequestHandler`.
- `docusaurus-plugin-mcp-server/adapters/node` — `createNodeServer`/`createNodeHandler` for local dev (Node `http`), and `readArtifactBundle(dir)`.
- `docusaurus-plugin-mcp-server/theme` — `McpInstallButton`.

Peers: `zod` (>= 4.2) is required. `@docusaurus/core` (and `react`/`react-dom` for the theme button) are optional peer deps; provide them from your Docusaurus app.

## Authoritative API

The authoritative API is the published TypeScript types. Read the `.d.ts` files referenced by `exports` in `package.json` before writing calls — do not guess signatures. `dist/` is a build artifact (git-ignored), so in a fresh clone run `npm run build` first, or read the corresponding `src/*.ts`:

- `.` → `dist/index.d.ts` (plugin options, `McpDocsServer`, provider/`ProcessedDoc` types)
- `./adapters` → `dist/adapters-entry.d.ts` (`WebRequestHandlerConfig`, `ArtifactBundle`)
- `./adapters/node` → `dist/adapters-node.d.ts` (`createNodeServer`/`createNodeHandler`, `NodeAdapterOptions`, `McpServerBundleDirConfig`, `readArtifactBundle`)
- `./theme` → `dist/theme/index.d.ts` (`McpInstallButton` props)

Config shape in particular (`artifacts`/`artifactsDir`, overrides such as `instructions`/`tools`) lives in those types — read them rather than copying field lists. `McpServerFileConfig` (`docsPath`/`indexPath`) and `McpServerDataConfig` (`docs`/`searchIndexData`) are deprecated since 2.2, as are the 2.1 unions `McpServerConfig`, `WebRequestAdapterConfig`, and `NodeServerOptions` (use `McpDocsServerConfig`, `WebRequestHandlerConfig`, `NodeAdapterOptions`); don't write new code against them.

## Usage patterns

**1. Build step.** Add the plugin to the `plugins` array in `docusaurus.config.js` with a `server.name`. `docusaurus build` then writes `build/mcp/`.

**2. Deploy to a serverless/edge runtime.** Edge/Worker runtimes can't read the filesystem, so import `bundle.json` as a module and pass it as `artifacts` to `createWebRequestHandler`, which returns a standard `(request: Request) => Promise<Response>`. The handler is identical across runtimes — only the export wrapper and platform config differ:

```js
import { createWebRequestHandler } from 'docusaurus-plugin-mcp-server/adapters';
import bundle from './build/mcp/bundle.json';

const handler = createWebRequestHandler({ artifacts: bundle });
```

`name`, `version`, and `baseUrl` default to what the site was built with; pass them only to override. Skills are in the bundle, so there's nothing to wire up.

Per-platform glue to scaffold:

- **Cloudflare Workers** — `export default { fetch: handler }`; add a `wrangler.toml` whose `main` is the worker entry, and a `[[rules]] type = "Data"` rule globbing `**/*.json` so the JSON imports bundle.
- **Deno / Bun** — `export default { fetch: handler }` (both honor the `fetch` default export).
- **Modern Netlify functions** — `export default async (request) => handler(request)` (the new web-standard functions API, not the legacy `event`/`context` one).
- **Vercel** — use the Edge runtime: `export const config = { runtime: 'edge' }` and `export default handler`.

**3. Run locally.** From `docusaurus-plugin-mcp-server/adapters/node`, `createNodeServer({ artifactsDir: './build/mcp' })` returns an `http.Server` you `.listen()`. Use `createNodeHandler(...)` to mount into an existing `http.createServer`. For `new McpDocsServer(...)` in Node, pass `artifacts: await readArtifactBundle('./build/mcp')`.

**Custom indexers and search providers.** The plugin always writes the documents. An indexer's `finalize()` may return `search-index.json` (becomes the bundle's search index; only one indexer may) and other relative ASCII filenames (indexer extras); `bundle.json`/`manifest.json`/`skills.json`, or anything that would overwrite them, fails the build. With an `artifacts`/`artifactsDir` server config, a `SearchProvider` gets it all as `initData.bundle` (`docs`, `searchIndex`, `extras`); with the deprecated configs it gets the 2.1 `initData`. `getDocument`/`getDocCount` are optional.

**Skills.** By default the build packages a built-in `docs-research` skill (search → fetch → cite), loaded from the package's `skills-builtin/docs-research/SKILL.md`. Its description is built from the site `title`, URL and `tagline`, and it gets a generated "Where things are" section grouping the indexed pages by URL path. For a skill that knows the product, write your own `docs-research` in the skills dir (same name replaces the built-in); if you start from a copy of the built-in, replace its `{{siteDocs}}`/`{{siteSummary}}`/`{{siteMap}}` placeholders, which only the built-in gets filled. Add site skills with the plugin option `skills: { dir: 'mcp-skills' }` (site-relative; one directory per skill, each with a `SKILL.md` whose frontmatter `name` matches the directory). `skills: { builtin: false, dir }` ships only yours; `skills: false` disables skills. The server serves them as `skill://<name>/<path>` resources, implements `skills/list`/`skills/get`, and lists the URIs in `instructions` for clients without the extension.

**4. Install button.** Render `McpInstallButton` (from `./theme`) in a navbar component with your `serverUrl`/`serverName`.

## Common mistakes

- **Filesystem paths on edge/Workers.** `artifactsDir` (and the deprecated `docsPath`/`indexPath`) only work where there's a filesystem (local Node). On Workers/edge, import `bundle.json` and pass it as `artifacts`.
- **Passing the wrong file as `artifacts`.** It must be `bundle.json`, not `docs.json`; the server rejects anything without a `formatVersion` and says what it expected.
- **Cloudflare JSON imports fail without the Data rule.** Missing `[[rules]] type = "Data"` in `wrangler.toml` makes the `bundle.json` import break at deploy.
- **Reaching for removed handlers.** `createVercelHandler`, `createNetlifyHandler`, `createCloudflareHandler`, and `generateAdapterFiles` were all removed — there is one generic deploy handler, `createWebRequestHandler`. The Node server lives at `docusaurus-plugin-mcp-server/adapters/node`, not `/adapters`.
- **Wrong `baseUrl`.** It must be the site origin plus the Docusaurus `baseUrl` (e.g. `https://example.com/docs/`); otherwise the URLs in search results point to the wrong place.
- **Deploying before building.** The handler needs `build/mcp/*` — run `docusaurus build` first.
- **Forgetting to pass skills (deprecated configs only).** With `artifacts`/`artifactsDir`, skills come from the bundle. With the deprecated configs, the handler only serves skills when you pass `skills` or `skillsPath`.
- **Invalid skill directories fail the build.** Frontmatter must have `name` (lowercase, hyphens, matching the directory) and `description`; each skill is capped at 512 files / 16 MiB.
- **zod 3.** 2.x requires zod >= 4.2 (MCP SDK v2).
- **1.x search options.** The built-in search is `'local'` (BM25). `'flexsearch'` in `indexers`/`search`, and the `flexsearch` plugin/server option, now throw. A 1.x `search-index.json` is rejected until the site is rebuilt; the error is returned in MCP responses and the GET status. Tune ranking with the server option `localSearch: { fieldBoosts }`. The plugin's `search` option does not choose the runtime provider; the server config's `search` does.
- **Very long queries.** `docs_search` accepts up to 500 characters and searches the first 16 distinct terms.
- **Guessing whether search is good enough.** Measure it: `evaluateSearch(provider, [{ query, expected: [routes] }])` reports top-k hits and MRR for any provider.

## Version notes

**On 2.2+ with the deprecated server configs?** Follow `node_modules/docusaurus-plugin-mcp-server/migrations/2.x-3.0.0.md`; its "For agents" checklist moves a project to `artifacts`/`artifactsDir` so 3.0 needs nothing more.

**Migrating a project from 1.x to 2.0?** Follow `node_modules/docusaurus-plugin-mcp-server/migrations/1.x-2.0.0.md` (published with the package, and on GitHub at `scalvert/docusaurus-plugin-mcp-server`). Its "For agents" section is a step-by-step checklist; errors thrown for 1.x configuration link to it.

Check the installed version with `npm ls docusaurus-plugin-mcp-server`. 2.0 requires Node.js >= 22, moved to the MCP TypeScript SDK v2 (`@modelcontextprotocol/server`) and protocol 2026-07-28 (2025-era clients still served), added skills, made `docsSearchTool.inputSchema`/`docsFetchTool.inputSchema` `z.object(...)` schemas (raw shapes remain as `docsSearchInputSchema`/`docsFetchInputSchema`), returns JSON-RPC `-32602` for unknown tools, and replaced the FlexSearch index with BM25 local search (`'local'`, `localSearch.fieldBoosts`, `evaluateSearch`, and exported `LocalSearchIndexer`/`LocalSearchProvider`). The adapter surface consolidated to one web-standard `createWebRequestHandler`; `createVercelHandler`/`createNetlifyHandler`/`generateAdapterFiles` are gone, and `createCloudflareHandler` was removed in 1.0.0 (it was a deprecated alias through 0.13.0). The Node server/handler moved to the `./adapters/node` subpath. Confirm exports against `dist/adapters-entry.d.ts` and `dist/adapters-node.d.ts` for the version you have.
