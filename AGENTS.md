# AGENTS.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build and Development Commands

```bash
npm run build          # Build with tsup (ESM-only output)
npm run dev            # Watch mode for development
npm run lint           # Run ESLint and Prettier check
npm run lint:fix       # Auto-fix lint issues
npm run typecheck      # TypeScript type checking
npm run test           # Run unit tests with Vitest
npm run test:watch     # Run tests in watch mode
npm run test:mcp       # Run Playwright MCP integration tests
npm run test:all       # Run lint, typecheck, and all tests
```

Run a single test file:
```bash
npx vitest run tests/markdown-test.ts
```

## Architecture Overview

This is a Docusaurus plugin that exposes documentation as an MCP (Model Context Protocol) server for AI agents.

### Two-Phase Design

**Build Time** (`src/pipeline/`, `src/plugin/`): runs during `docusaurus build`:
- `src/pipeline/build-outputs.ts` - The build pipeline, with no Docusaurus in it: `buildOutputs({ outDir, options, site })` returns the artifact bundle (or why it skipped) and writes nothing. Test build behavior here, against HTML fixtures (`tests/build-outputs-test.ts`). New build steps go here, not in the hook
- `src/plugin/docusaurus-plugin.ts` - The Docusaurus adapter: `postBuild` maps `LoadContext` to `SiteInfo`, calls `buildOutputs`, and writes the bundle
- Processes HTML files → extracts content → converts to markdown → builds search index
- Packages Agent Skills (built-in `docs-research` + optional site skills) with digests
- Assembles the artifact bundle, written to `build/mcp/bundle.json` plus 2.x per-file copies (docs.json, search-index.json, skills.json, manifest.json, indexer extras). See `CONTEXT.md` for the terms and `docs/adr/0001-single-artifact-bundle.md` for why

**Runtime** (`src/mcp/`, `src/adapters/`): Serverless functions serve MCP requests:
- `McpDocsServer` class wraps the MCP TypeScript SDK v2 (`@modelcontextprotocol/server`). It serves protocol 2026-07-28 statelessly and routes 2025-era (`initialize`) requests to a stateless JSON-response transport on the same endpoint
- Every config resolves to one artifact bundle: `artifacts` (the contents of `bundle.json`), or `artifactsDir` in the Node adapter. The file (`docsPath`/`indexPath`) and pre-loaded data (`docs`/`searchIndexData`) configs are deprecated since 2.2, removed in 3.0 (`migrations/2.x-3.0.0.md`), and covered only by `tests/legacy-config-test.ts`
- `createWebRequestHandler` — one generic web-standard `(Request) => Response` handler for any serverless/edge runtime
- `createNodeServer`/`createNodeHandler` — local-dev server over Node `http`; takes `artifactsDir`

### Entry Points

The package has four export paths configured in `package.json`:
- `.` → Main plugin + MCP server (`src/index.ts`)
- `./adapters` → Web-standard handler for serverless/edge (`src/adapters-entry.ts`); must not statically import Node built-ins
- `./adapters/node` → Local-dev Node server (`src/adapters-node.ts`)
- `./theme` → React components (`src/theme/index.ts`)

The plugin also has a Docusaurus theme (`getThemePath`, off with `mdxComponents: false`): `src/theme-mdx/MDXComponents.ts`, built to `dist/theme-mdx/`, adds `mdxComponents` (`src/theme/mdx-components.ts`) to `@theme-init/MDXComponents` so pages use the components without an import. Docusaurus aliases every `.js`/`.ts` file in that directory as `@theme/<name>`, so it holds only `MDXComponents`. Its import of the components is rewritten to the built `../theme/index.js` and kept external (`tsup.config.ts`), so pages that import from `./theme` get the same module. `THEME_MDX_DIR` (`src/theme-mdx-dir.ts`) sits at the root of `src` so the same relative URL finds the directory in source and in `dist`; `tests/docusaurus-load-test.ts` checks the built path.

### Key Modules

- `src/mcp/server.ts` - Core MCP server using `@modelcontextprotocol/server` (era dispatch, cache hints)
- `src/mcp/tools/` - The MCP tools (`docs_search`, `docs_fetch`). Each tool module owns its schema, description, handler, and error messages, and registers itself; the server supplies search, document lookup, readiness, and the configured description overrides. `tool.ts` (internal, not exported) holds the shared readiness guard (`runTool`) and result helpers. Wire output changes must show up as a reviewed diff in `tests/__golden__/tool-wire/` (regenerate with `npx vitest run tests/tool-wire-golden-test.ts -u`)
- `src/mcp/skills.ts` - Skills extension runtime (`io.modelcontextprotocol/skills`: `skills/list`, `skills/get`, `skill://` resources); edge-safe
- `src/mcp/resolve.ts` - Document resolution: turns whatever an agent passes to `docs_fetch` (document ID, trailing slash, `#fragment`, `.md`/`.html`, root-relative path, `skill://` URI) into a document, a skill file, or a miss with similar pages. Every URI rule lives here; tools only format. Provider `getDocument` first, then the bundle. Edge-safe
- `src/skills/` - Build-time skill packaging (`packager.ts`) and built-in skill loading/templating (`builtin.ts`). Packaging takes in-memory `SkillSource`s (`{ name, origin, kind, files }`); reading a directory (`readSkillDir`) is one way to get one. `packageSkills` is the only place name collisions are decided. A new kind of skill (e.g. generated from pages) builds sources, not directories
- `skills-builtin/` - Built-in skills shipped in the package (`docs-research/SKILL.md`, with `{{siteDocs}}`/`{{siteSummary}}`/`{{siteMap}}` placeholders filled by `src/skills/builtin.ts`; the site map is generated in `src/skills/site-map.ts`). Published via package.json `files`; distinct from `skills/`, which is this repo's own developer skill
- `src/adapters/http.ts` - The one HTTP policy (preflight, GET status, 405, CORS, error mapping) on web `Request`/`Response`. `createWebRequestHandler` is this policy; `createNodeHandler` bounds and reads the body, then bridges into it. Change HTTP behavior here, not in an adapter
- `src/adapters/node-bridge.ts` - Node `IncomingMessage`/`ServerResponse` ↔ web `Request`/`Response`
- `src/agent-view/` - The agent view: what agents get from a page. `audience.ts` is the `ForAgents`/`ForHumans` attribute contract, shared by the theme (writes it) and extraction (reads it); edge-safe. `tree.ts` drops human-only content from a page's content tree before Markdown and headings are made (build-time). `render.ts` is the one Markdown rendering of a document that `docs_fetch` returns; anything else that serves pages to agents should use it; edge-safe
- `src/guides/` - Agent guides (format v1, `docs/agent-guide-format.md`): setup and troubleshooting procedures marked up in pages and compiled into skills. `contract.ts` is the one owner of attribute names, the fixed "How to use this guide" text, and the format version (theme, extraction, and compiler import it; `tests/guide-contract-test.ts` checks the spec quotes it); edge-safe. `extract.ts` reads one page's agent view into fragments plus placement errors, called from page extraction in the same parse. `compile.ts` is pure: fragments from every page in, skill sources and diagnostics out; the pipeline throws `GuideValidationError` on errors. Compiled output is golden-tested in `tests/__golden__/guides/` (regenerate with `npx vitest run tests/guides-test.tsx -u`)
- `src/processing/` - Page extraction: `extractDocs(outDir, options)` turns a build directory into documents (`extract-docs.ts`; page discovery in `pages.ts`, tree-to-Markdown in `markdown.ts`, headings in `headings.ts`). Each page is parsed once. Output changes must show up as a reviewed diff in `tests/extract-golden-test.ts` (regenerate with `-u`)
- `src/search/` - Built-in BM25 local search (`local-search.ts`, MiniSearch) and the `evaluateSearch` ranking harness (`evaluate.ts`)
- `src/providers/` - Pluggable indexer/search provider system
- `src/artifacts/` - The artifact bundle: shape, member filenames, format version, and validation (`bundle.ts`, edge-safe); file IO (`node.ts`, Node only). Add new filenames under `build/mcp/` here, not in callers
- `src/cli/verify.ts` - CLI entry for verifying build output; the checks live in `src/cli/verify-build.ts`

### Domain language and decisions

`CONTEXT.md` is the glossary (artifact bundle, document, document ID, indexer extras, and so on); use its terms in code and docs. `docs/adr/` records decisions not to re-litigate without new information.

### Provider System

Indexers and search providers are pluggable via the `src/providers/` system:
- `ContentIndexer` - Processes docs at build time (e.g., LocalSearchIndexer)
- `SearchProvider` - Handles queries at runtime (e.g., LocalSearchProvider). The server holds it as a `SearchRanker` (only `name` and `search` required; `initialize`, `isReady`, `getDocument`, `getDocCount` optional), so call the optional members with `?.`. `isReady` and `healthCheck` are deprecated since 2.2

Ranking changes must keep `tests/search-ranking-test.ts` passing; its thresholds are floors.

## Testing

- Unit tests: `tests/*.ts` using Vitest. Build servers in tests with `buildTestBundle` from `tests/helpers/bundle.ts`, not by reading artifact filenames. `tests/protocol-eras-test.ts` drives the v2 client (`@modelcontextprotocol/client`) in both 2026-07-28 and 2025-era modes
- Integration tests: `tests/playwright/` using `@gleanwork/mcp-server-tester` (a 2025-era client, so it also guards backward compatibility)
  - `mcp.spec.ts` - conformance checks and protocol behavior
  - `evals.spec.ts` + `evals/*.json` - direct-mode eval datasets for tool output; update snapshots with `npm run test:mcp -- --update-snapshots`

## Package Format

ESM-only (`"type": "module"`). All imports use `.js` extensions in source files.

## Documentation site

`website/` is the docs site (Docusaurus, classic theme), built with this plugin and served over its own MCP endpoint (`website/api/mcp.mjs`, routed from `/mcp` by `website/vercel.json`). It depends on the plugin as `file:..` with `install-links=true` (`website/.npmrc`), so build the root package (`npm run build`) before `npm ci` in `website/`.

```bash
npm run build && (cd website && npm ci && npm run build && npm run smoke)
```

- The README is a short quick start; detailed docs live in `website/docs/`. When the public API or behavior changes, update the matching page there (reference pages under `website/docs/reference/`, deploy guides under `website/docs/deploy/`).
- Code blocks with `snippet=readme/...` in the README and `website/docs/` are kept in sync with `snippets/` by `markdown-code` (`npm run snippets:check` / `snippets:sync`). Edit the snippet file, then sync.
- `migrations/` is rendered at `/migrations` by a second docs plugin instance, so migration guides must compile as MDX.
- The site deploys to Vercel only on release tags (`.github/workflows/deploy-website.yml`); `.github/workflows/website.yml` builds and smoke-tests it on every PR. Git-triggered Vercel deployments are off (`git.deploymentEnabled: false`) in both the root `vercel.json` (read by Vercel's Git integration, since the project's Root Directory is the repo root) and `website/vercel.json`.
- Deploy guides were verified against real platform builds; keep the function files and configs in them exact.

## Skills

This repository ships agent skills under `skills/`, installed with `npx skills add scalvert/docusaurus-plugin-mcp-server`:

- `skills/docusaurus-plugin-mcp-server/SKILL.md` is hand-written: the API reference and common mistakes. Keep it accurate as the public API changes, and keep its "Step-by-step skills" table in step with the guides.
- Every other directory is an agent guide compiled from a website page (Getting started, the Vercel, Netlify, Cloudflare Workers, and static-host deploy pages, and Agent guides), with symptoms from `website/docs/deploy/troubleshooting.md`. Don't edit them: edit the page, then in `website/` run `npm run build && npm run skills:sync` and commit `skills/`. `website/scripts/sync-skills.mjs` copies them from the bundle, and CI (`npm run skills:check`) fails when they don't match the site.

## Breaking changes

Every major release gets a migration guide at `migrations/<from>-<to>.md` (published with the package). List each breaking change with before/after code, and end with a "For agents" checklist that an agent can run top to bottom. Errors thrown for removed configuration should link to it (`MIGRATION_GUIDE` in `src/errors.ts`). The README's "Upgrading" section stays a short summary that links to the guide; `website/docs/upgrading.md` carries the per-release summary.
