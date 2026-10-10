---
title: Introduction
description: What docusaurus-plugin-mcp-server does, how it works, and what you need to use it.
slug: /
---

# Introduction

`docusaurus-plugin-mcp-server` turns a built Docusaurus site into a [Model Context Protocol (MCP)](https://modelcontextprotocol.io/) server. AI agents such as Claude, Cursor, and VS Code connect to it and can search your docs and read any page as Markdown.

The server speaks MCP [2026-07-28](https://modelcontextprotocol.io/specification/2026-07-28). It also serves clients on 2025-era revisions (the `initialize` handshake) from the same endpoint, so you don't have to know which protocol a client uses.

## What agents get

- **`docs_search`** finds pages by relevance and returns URLs, snippets, and matching headings. It uses BM25 ranking with no external service.
- **`docs_fetch`** returns one page as Markdown, with a table of contents.
- **Agent Skills.** A built-in `docs-research` skill teaches agents to search, fetch, and cite your docs. You can add skills of your own.
- **Agent guides.** Mark up a setup or troubleshooting page with `Step`, `Check`, and `Symptom`, and the build compiles it into a skill agents follow step by step, checking each step. The page stays the one source. See [Agent guides](./guides/agent-guides.md).

See [MCP tools](./reference/mcp-tools.md) for the inputs and outputs.

## How it works

The plugin works in two phases.

1. **Build time.** During `docusaurus build`, the plugin's `postBuild` hook reads every rendered HTML page, extracts the content, converts it to Markdown, and builds a search index. It writes all of it to one file, the **artifact bundle**, at `build/mcp/bundle.json`. Because it reads rendered HTML, the output of MDX and React components is included.
2. **Runtime.** A small serverless function imports the bundle and answers MCP requests. The server is stateless, so any instance can answer any request. It doesn't need Docusaurus at runtime, and nothing is indexed per request.

```text
docusaurus build ──► build/mcp/bundle.json ──► serverless function at /mcp ◄──► AI agents
     (postBuild)         (docs + index + skills)     (createWebRequestHandler)        (MCP)
```

Content changes only when you rebuild and redeploy, so the server marks list and read results as cacheable (`ttlMs` 5 minutes, `cacheScope: public`).

## Where it runs

The handler is a web-standard `(Request) => Promise<Response>` function, so it runs on any serverless or edge runtime. The [deployment guides](./deploy/index.md) have complete, copy-paste setups for:

- [Vercel](./deploy/vercel.md)
- [Netlify](./deploy/netlify.md)
- [Cloudflare Workers](./deploy/cloudflare-workers.md)
- [Deno and Bun](./deploy/deno-and-bun.md)
- [Node.js and Express](./deploy/node.md)
- [GitHub Pages and other static hosts](./deploy/static-hosts.md), with the endpoint hosted somewhere else

:::tip[This site runs on the plugin]

These docs are built with `docusaurus-plugin-mcp-server` and deployed to Vercel exactly as the [Vercel guide](./deploy/vercel.md) describes. Use the **Install MCP** button in the navbar to connect your agent to them. Every procedure here, from [Getting started](./getting-started.md) to each deploy guide, is also an agent guide your agent can follow: connect it, or install the skills with `npx skills add scalvert/docusaurus-plugin-mcp-server`.

:::

## Requirements

- Node.js 22 or later
- Docusaurus 3.x
- zod 4.2 or later

## Next steps

- [Get started](./getting-started.md): add the plugin and run the server locally.
- [Deploy](./deploy/index.md): put the endpoint in production.
