# CLAUDE.md

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
- Outputs artifacts to `build/mcp/` (docs.json, search-index.json, manifest.json)

**Runtime** (`src/mcp/`, `src/adapters/`): Serverless functions serve MCP requests:
- `McpDocsServer` class wraps the official MCP SDK
- Platform adapters (Vercel, Netlify, Cloudflare) handle HTTP → MCP translation
- Two modes: file-based (Node.js) or pre-loaded data (Workers)

### Entry Points

The package has three export paths configured in `package.json`:
- `.` → Main plugin + MCP server (`src/index.ts`)
- `./adapters` → Platform handlers (`src/adapters-entry.ts`)
- `./theme` → React components (`src/theme/index.ts`)

### Key Modules

- `src/mcp/server.ts` - Core MCP server using `@modelcontextprotocol/sdk`
- `src/mcp/tools/` - MCP tool definitions (`docs_search`, `docs_fetch`)
- `src/processing/` - HTML parsing, markdown conversion, heading extraction
- `src/search/` - FlexSearch integration for full-text search
- `src/providers/` - Pluggable indexer/search provider system
- `src/cli/verify.ts` - CLI for verifying build output

### Provider System

Indexers and search providers are pluggable via the `src/providers/` system:
- `ContentIndexer` - Processes docs at build time (e.g., FlexSearchIndexer)
- `SearchProvider` - Handles queries at runtime (e.g., FlexSearchProvider)

## Testing

- Unit tests: `tests/*.ts` using Vitest
- Integration tests: `tests/playwright/mcp.spec.ts` using `@gleanwork/mcp-server-tester`

## Package Format

ESM-only (`"type": "module"`). All imports use `.js` extensions in source files.
