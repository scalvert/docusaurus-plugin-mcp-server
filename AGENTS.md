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
npx vitest run tests/html-to-markdown-test.ts
```

## Architecture Overview

This is a Docusaurus plugin that exposes documentation as an MCP (Model Context Protocol) server for AI agents.

### Two-Phase Design

**Build Time** (`src/plugin/`): The Docusaurus plugin runs during `docusaurus build`:
- `docusaurus-plugin.ts` - Main plugin with `postBuild` hook
- Processes HTML files → extracts content → converts to markdown → builds search index
- Packages Agent Skills (built-in `docs-research` + optional site skills) with digests
- Outputs artifacts to `build/mcp/` (docs.json, search-index.json, skills.json, manifest.json)

**Runtime** (`src/mcp/`, `src/adapters/`): Serverless functions serve MCP requests:
- `McpDocsServer` class wraps the MCP TypeScript SDK v2 (`@modelcontextprotocol/server`). It serves protocol 2026-07-28 statelessly and routes 2025-era (`initialize`) requests to a stateless JSON-response transport on the same endpoint
- `createWebRequestHandler` — one generic web-standard `(Request) => Response` handler for any serverless/edge runtime (pre-loaded data)
- `createNodeServer`/`createNodeHandler` — local-dev server over Node `http` (file-based)

### Entry Points

The package has four export paths configured in `package.json`:
- `.` → Main plugin + MCP server (`src/index.ts`)
- `./adapters` → Web-standard handler for serverless/edge (`src/adapters-entry.ts`); must not statically import Node built-ins
- `./adapters/node` → Local-dev Node server (`src/adapters-node.ts`)
- `./theme` → React components (`src/theme/index.ts`)

### Key Modules

- `src/mcp/server.ts` - Core MCP server using `@modelcontextprotocol/server` (era dispatch, cache hints)
- `src/mcp/tools/` - MCP tool definitions (`docs_search`, `docs_fetch`)
- `src/mcp/skills.ts` - Skills extension runtime (`io.modelcontextprotocol/skills`: `skills/list`, `skills/get`, `skill://` resources); edge-safe
- `src/skills/` - Build-time skill packaging (`packager.ts`) and built-in skill loading/templating (`builtin.ts`)
- `skills-builtin/` - Built-in skills shipped in the package (`docs-research/SKILL.md`, with a `{{siteTitle}}` placeholder). Published via package.json `files`; distinct from `skills/`, which is this repo's own developer skill
- `src/adapters/node-bridge.ts` - Node `IncomingMessage`/`ServerResponse` ↔ web `Request`/`Response`
- `src/processing/` - HTML parsing, markdown conversion, heading extraction
- `src/search/` - Built-in BM25 local search (`local-search.ts`, MiniSearch) and the `evaluateSearch` ranking harness (`evaluate.ts`)
- `src/providers/` - Pluggable indexer/search provider system
- `src/cli/verify.ts` - CLI for verifying build output

### Provider System

Indexers and search providers are pluggable via the `src/providers/` system:
- `ContentIndexer` - Processes docs at build time (e.g., LocalSearchIndexer)
- `SearchProvider` - Handles queries at runtime (e.g., LocalSearchProvider)

Ranking changes must keep `tests/search-ranking-test.ts` passing; its thresholds are floors.

## Testing

- Unit tests: `tests/*.ts` using Vitest. `tests/protocol-eras-test.ts` drives the v2 client (`@modelcontextprotocol/client`) in both 2026-07-28 and 2025-era modes
- Integration tests: `tests/playwright/` using `@gleanwork/mcp-server-tester` (a 2025-era client, so it also guards backward compatibility)
  - `mcp.spec.ts` - conformance checks and protocol behavior
  - `evals.spec.ts` + `evals/*.json` - direct-mode eval datasets for tool output; update snapshots with `npm run test:mcp -- --update-snapshots`

## Package Format

ESM-only (`"type": "module"`). All imports use `.js` extensions in source files.

## Skills

This repository ships an agent skill at `skills/docusaurus-plugin-mcp-server/SKILL.md`. Keep it accurate as the public API changes.
