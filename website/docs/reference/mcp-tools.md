---
title: MCP tools
description: The docs_search and docs_fetch tools, their parameters and results, and the other MCP features the server implements.
---

# MCP tools

The server exposes two tools. Their descriptions can be overridden with the [`tools` server option](./server-options.md).

## `docs_search`

Searches the docs and returns matching pages, best first. See [Search](../guides/search.md) for how results are ranked.

```json snippet=readme/snippet-09.json
{
  "name": "docs_search",
  "arguments": {
    "query": "authentication",
    "limit": 16
  }
}
```

| Parameter | Type | Default | Description |
| --- | --- | --- | --- |
| `query` | `string` | required | Search query, up to 500 characters. Only the first 16 distinct terms are searched |
| `limit` | `number` | `16` | Maximum results, 1–20 |

Each result has:

- the page's full URL, to pass to `docs_fetch`
- the title and relevance score
- a snippet of matching content
- the matching headings

## `docs_fetch`

Returns one page's full content as Markdown. Use it after searching.

```json snippet=readme/snippet-10.json
{
  "name": "docs_fetch",
  "arguments": {
    "url": "https://docs.example.com/docs/authentication"
  }
}
```

| Parameter | Type | Description |
| --- | --- | --- |
| `url` | `string` | Full URL of the page, from search results |

The result has:

- the page title and description
- a table of contents with anchor links
- the full Markdown content

## Other MCP features

| Feature | Details |
| --- | --- |
| Protocol versions | 2026-07-28 (stateless, `server/discover`), and 2025-era revisions through `initialize`, on the same endpoint |
| Skills extension | `io.modelcontextprotocol/skills`: `skills/list`, `skills/get`. See [Agent Skills](../guides/agent-skills.md) |
| Resources | Every skill file at `skill://<name>/<path>`, readable with `resources/read` |
| Instructions | The `instructions` server option, with skill URIs appended |
| Caching | List and read results carry cache hints: `ttlMs` 5 minutes, `cacheScope: public` |
| Errors | Unknown tools return JSON-RPC `-32602` |
