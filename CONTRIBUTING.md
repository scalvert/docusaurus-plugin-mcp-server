# Contributing

## Prerequisites

- Node.js >= 22

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
npx vitest run tests/markdown-test.ts
```

## Project Structure

- `src/plugin/` — Docusaurus plugin (build-time processing)
- `src/mcp/` — MCP server, tool definitions, and the skills extension runtime
- `src/skills/` — Build-time Agent Skills packaging
- `skills-builtin/` — Built-in skills shipped with the package (`docs-research`)
- `src/adapters/` — Runtime handlers (`web-request.ts` for serverless/edge, `node.ts` for local dev, `node-bridge.ts` for Node ↔ web request conversion)
- `src/processing/` — Page extraction: build directory in, documents out (`extractDocs`)
- `src/search/` — Built-in BM25 local search and the `evaluateSearch` ranking harness
- `src/providers/` — Pluggable indexer and search provider system
- `src/theme/` — React components (McpInstallButton)
- `tests/` — Unit tests (Vitest), `tests/playwright/` integration tests and `tests/site/` contract tests for the docs site (`@gleanwork/mcp-server-tester`), and `tests/evals/` agent evals for the site's guides (see `tests/evals/README.md`)

See `CLAUDE.md` for detailed architecture notes.

## Pull Requests

Before submitting a PR:

1. Run `npm run lint` and fix any issues.
2. Run `npm run typecheck` to verify types.
3. Run `npm test` to ensure all unit tests pass.
4. Run `npm run test:mcp` if your changes affect the MCP server or adapters.
5. If you changed a guide or a docs page an agent relies on, build the site and run `npm run test:site`. For a change to what a guide tells agents to do, also run the evals in `tests/evals/`.

Keep PRs focused on a single concern. Include tests for new functionality.
