<div align="center">

<img src="assets/icon/dino-mcp-yellow-512.png" alt="The Docusaurus dinosaur hugging the MCP logo" width="160">

# docusaurus-plugin-mcp-server

![CI Build](https://github.com/scalvert/docusaurus-plugin-mcp-server/actions/workflows/ci.yml/badge.svg)
[![npm version](https://badge.fury.io/js/docusaurus-plugin-mcp-server.svg)](https://badge.fury.io/js/docusaurus-plugin-mcp-server)
[![License](https://img.shields.io/npm/l/docusaurus-plugin-mcp-server.svg)](https://github.com/scalvert/docusaurus-plugin-mcp-server/blob/main/LICENSE)

**[Documentation](https://docusaurus-plugin-mcp-server.vercel.app)** · [Getting started](https://docusaurus-plugin-mcp-server.vercel.app/docs/getting-started) · [Deploy guides](https://docusaurus-plugin-mcp-server.vercel.app/docs/deploy) · [Reference](https://docusaurus-plugin-mcp-server.vercel.app/docs/reference/plugin-options)

</div>

A Docusaurus plugin that exposes an [MCP (Model Context Protocol)](https://modelcontextprotocol.io/) server endpoint, allowing AI agents like Claude, Cursor, and other MCP-compatible tools to search and retrieve your documentation.

The server speaks MCP [2026-07-28](https://modelcontextprotocol.io/specification/2026-07-28) and still serves clients on 2025-era revisions (the `initialize` handshake) from the same endpoint. It can also serve [Agent Skills](https://docusaurus-plugin-mcp-server.vercel.app/docs/guides/agent-skills) that teach agents how to use your docs tools.

The [documentation site](https://docusaurus-plugin-mcp-server.vercel.app) is built with this plugin. Connect your agent to it:

```bash
claude mcp add --transport http docusaurus-plugin-mcp-server https://docusaurus-plugin-mcp-server.vercel.app/mcp
```

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

Set `url` in `docusaurus.config.js` to your production domain: page URLs in tool results are built from it.

### 2. Create the API Endpoint

`docusaurus build` writes the artifact bundle to `build/mcp/bundle.json`. Serve it from a function at `/mcp` with `createWebRequestHandler`, which returns a standard `(request: Request) => Promise<Response>` for any serverless or edge runtime:

```javascript snippet=readme/snippet-06.js
import { createWebRequestHandler } from 'docusaurus-plugin-mcp-server/adapters';
import bundle from '../build/mcp/bundle.json' with { type: 'json' };

export default {
  // Name, version, and site URL come from the build; pass them here to override.
  fetch: createWebRequestHandler({ artifacts: bundle }),
};
```

Where that file goes and how `/mcp` is routed to it depends on your host. Each guide is a complete setup:

| Platform | Guide |
|----------|-------|
| Vercel | [Deploy to Vercel](https://docusaurus-plugin-mcp-server.vercel.app/docs/deploy/vercel) |
| Netlify | [Deploy to Netlify](https://docusaurus-plugin-mcp-server.vercel.app/docs/deploy/netlify) |
| Cloudflare Workers | [Deploy to Cloudflare Workers](https://docusaurus-plugin-mcp-server.vercel.app/docs/deploy/cloudflare-workers) |
| Deno, Bun | [Deploy with Deno or Bun](https://docusaurus-plugin-mcp-server.vercel.app/docs/deploy/deno-and-bun) |
| Node.js, Express | [Deploy with Node.js and Express](https://docusaurus-plugin-mcp-server.vercel.app/docs/deploy/node) |
| GitHub Pages, other static hosts | [Static hosts](https://docusaurus-plugin-mcp-server.vercel.app/docs/deploy/static-hosts) |

### 3. Build and Verify

```bash
npm run build
npx docusaurus-mcp-verify
```

### 4. Connect Your AI Tool

```bash
claude mcp add --transport http my-docs https://docs.example.com/mcp
```

```json snippet=readme/snippet-07.json
{
  "mcpServers": {
    "my-docs": {
      "url": "https://docs.example.com/mcp"
    }
  }
}
```

See [Connecting AI tools](https://docusaurus-plugin-mcp-server.vercel.app/docs/guides/connect-clients) for VS Code, Codex, Gemini CLI, and others, and [Install button](https://docusaurus-plugin-mcp-server.vercel.app/docs/guides/install-button) to give your readers a one-click config.

## MCP Tools

- **`docs_search`**: BM25-ranked search across your docs. Returns URLs, snippets, and matching headings.
- **`docs_fetch`**: one page, or one `#section`, as Markdown with a table of contents. Accepts links as agents copy them (root-relative, trailing slash, `.md`) and, when skills are served, `skill://` URIs.

Details in [MCP tools](https://docusaurus-plugin-mcp-server.vercel.app/docs/reference/mcp-tools).

## Documentation

- [Getting started](https://docusaurus-plugin-mcp-server.vercel.app/docs/getting-started): install, build, and run the server locally
- [Deploy](https://docusaurus-plugin-mcp-server.vercel.app/docs/deploy): platform guides, deployment checks, and [troubleshooting](https://docusaurus-plugin-mcp-server.vercel.app/docs/deploy/troubleshooting)
- Guides: [Agent Skills](https://docusaurus-plugin-mcp-server.vercel.app/docs/guides/agent-skills), [Search](https://docusaurus-plugin-mcp-server.vercel.app/docs/guides/search), [Custom providers](https://docusaurus-plugin-mcp-server.vercel.app/docs/guides/custom-providers), [Testing the endpoint](https://docusaurus-plugin-mcp-server.vercel.app/docs/guides/testing)
- Reference: [Plugin options](https://docusaurus-plugin-mcp-server.vercel.app/docs/reference/plugin-options), [Server options](https://docusaurus-plugin-mcp-server.vercel.app/docs/reference/server-options), [Artifact bundle](https://docusaurus-plugin-mcp-server.vercel.app/docs/reference/artifact-bundle), [API](https://docusaurus-plugin-mcp-server.vercel.app/docs/reference/api), [`docusaurus-mcp-verify`](https://docusaurus-plugin-mcp-server.vercel.app/docs/reference/cli)

The site's source is in [`website/`](website/).

## Upgrading

Every major release has a migration guide with before/after code and a checklist an AI agent can run:

- **2.x → 3.0** (not released yet): [migrations/2.x-3.0.0.md](migrations/2.x-3.0.0.md). Everything it covers is deprecated in 2.2 and still works through 2.x.
- **1.x → 2.0**: [migrations/1.x-2.0.0.md](migrations/1.x-2.0.0.md)
- **0.13 → 1.0**: [migrations/0.13.0-1.0.0.md](migrations/0.13.0-1.0.0.md)

[Upgrading](https://docusaurus-plugin-mcp-server.vercel.app/docs/upgrading) summarizes what changed in each release line.

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
