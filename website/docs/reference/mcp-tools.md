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

Returns one page's full content as Markdown, or one section of it. Use it after searching.

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
| `url` | `string` | The page: a URL from search results or a link in a fetched page. Add `#heading-id` for one section. Also a `skill://` URI when the server serves [skills](../guides/agent-skills.md) |

The result has:

- the page title and description
- a table of contents with anchor links
- the full Markdown content

The server resolves the forms agents commonly pass to the page's URL: a trailing slash, a `.md` or `.html` suffix, `/index.html`, a query string, and root-relative paths like `/docs/authentication` (resolved against the site's origin). It never rewrites the host.

- **`#heading-id`**: returns only that section, through its subsections, with a note naming the page. An unknown heading ID returns the whole page.
- **Not found**: names the URL it tried, lists up to three pages whose path ends the same way (for moved pages), and points to `docs_search`.
- **`skill://` URI**: the skill file's text, exactly as `resources/read` serves it.

The exported `docsFetchTool.inputSchema` and `docsFetchInputSchema` still require an absolute URL, as in 2.0; only the schema the server registers accepts the other forms.

## Other MCP features

| Feature | Details |
| --- | --- |
| Protocol versions | 2026-07-28 (stateless, `server/discover`), and 2025-era revisions through `initialize`, on the same endpoint |
| Skills extension | `io.modelcontextprotocol/skills`: `skills/list`, `skills/get`. See [Agent Skills](../guides/agent-skills.md) |
| Resources | Every skill file at `skill://<name>/<path>`, readable with `resources/read` or `docs_fetch` |
| Instructions | The `instructions` server option, with skill URIs appended |
| Caching | List and read results carry cache hints: `ttlMs` 5 minutes, `cacheScope: public` |
| Errors | Unknown tools return JSON-RPC `-32602` |
