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
- `src/mcp/` — MCP server and tool definitions
- `src/adapters/` — Platform adapters (Vercel, Netlify, Cloudflare, Node)
- `src/processing/` — HTML parsing and markdown conversion
- `src/search/` — FlexSearch integration
- `src/providers/` — Pluggable indexer and search provider system
- `src/theme/` — React components (McpInstallButton)
- `tests/` — Unit and integration tests

See `CLAUDE.md` for detailed architecture notes.

## Pull Requests

Before submitting a PR:

1. Run `npm run lint` and fix any issues.
2. Run `npm run typecheck` to verify types.
3. Run `npm test` to ensure all unit tests pass.
4. Run `npm run test:mcp` if your changes affect the MCP server or adapters.

Keep PRs focused on a single concern. Include tests for new functionality.
