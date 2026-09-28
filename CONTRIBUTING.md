# Contributing

## Prerequisites

- Node.js >= 20

## Getting Started

```bash
git clone https://github.com/scalvert/docusaurus-plugin-mcp-server.git
cd docusaurus-plugin-mcp-server
npm install
npm run build
```

## Development Commands

| Command | Description |
|---------|-------------|
| `npm run dev` | Watch mode — rebuilds on file changes |
| `npm run build` | Build with tsup (ESM-only output) |
| `npm run lint` | Run ESLint and Prettier check |
| `npm run lint:fix` | Auto-fix lint issues |
| `npm run typecheck` | TypeScript type checking |
| `npm test` | Run unit tests with Vitest |
| `npm run test:watch` | Run tests in watch mode |
| `npm run test:mcp` | Run Playwright MCP integration tests |
| `npm run test:all` | Run lint, typecheck, and all tests |

Run a single test file:

```bash
npx vitest run tests/html-to-markdown-test.ts
```

## Project Structure

- `src/plugin/` — Docusaurus plugin (build-time processing)
- `src/mcp/` — MCP server, tool definitions, and the skills extension runtime
- `src/skills/` — Build-time Agent Skills packaging
- `skills-builtin/` — Built-in skills shipped with the package (`docs-research`)
- `src/adapters/` — Runtime handlers (`web-request.ts` for serverless/edge, `node.ts` for local dev, `node-bridge.ts` for Node ↔ web request conversion)
- `src/processing/` — HTML parsing and markdown conversion
- `src/search/` — Built-in BM25 local search and the `evaluateSearch` ranking harness
- `src/providers/` — Pluggable indexer and search provider system
- `src/theme/` — React components (McpInstallButton)
- `tests/` — Unit tests (Vitest) and `tests/playwright/` integration tests and eval datasets (`@gleanwork/mcp-server-tester`)

See `CLAUDE.md` for detailed architecture notes.

## Pull Requests

Before submitting a PR:

1. Run `npm run lint` and fix any issues.
2. Run `npm run typecheck` to verify types.
3. Run `npm test` to ensure all unit tests pass.
4. Run `npm run test:mcp` if your changes affect the MCP server or adapters.

Keep PRs focused on a single concern. Include tests for new functionality.
