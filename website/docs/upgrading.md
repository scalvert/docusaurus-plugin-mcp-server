---
title: Upgrading
description: What changed in each release line, and the migration guides with before/after code and an agent checklist.
---

# Upgrading

Every major release has a migration guide. Each lists every breaking change with before/after code, and ends with a **For agents** checklist an AI agent can run top to bottom. Errors thrown for removed configuration link to them.

| From | To | Guide |
| --- | --- | --- |
| 2.x | 3.0.0 (not released yet) | [Migrating from 2.x to 3.0.0](/migrations/2.x-3.0.0) |
| 1.x | 2.0.0 | [Migrating from 1.x to 2.0.0](/migrations/1.x-2.0.0) |
| 0.13.0 | 1.0.0 | [Migrating from 0.13.0 to 1.0.0](/migrations/0.13.0-1.0.0) |

The guides also ship in the npm package, under `node_modules/docusaurus-plugin-mcp-server/migrations/`.

## 2.2: moving off the deprecated server configs

2.2 changes nothing you have to act on. It adds `build/mcp/bundle.json` and the `artifacts` / `artifactsDir` server options. It deprecates:

- the file configs (`docsPath`, `indexPath`, `skillsPath`) and pre-loaded data configs (`docs`, `searchIndexData`, `skills`)
- `McpDocsServer.handleHttpRequest()`. Use `createNodeHandler`.
- the search provider methods `isReady()` and `healthCheck()`. A provider can now be just `{ name, search }`, a `SearchRanker`.
- the plugin's `search` option, which has done nothing since 2.0

Those still work through 2.x and are removed in 3.0. [Migrating from 2.x to 3.0.0](/migrations/2.x-3.0.0) has the before/after code.

Three extraction changes alter the generated docs:

- **`excludeSelectors` are full CSS.** Before 2.2, only tag names, `.class`, and `[attr="v"]` on plain attributes matched. Anything else (`div.sidebar`, `.a .b`, `[data-x="y"]`) was silently ignored, and a selector starting with an attribute (`[role="tab"] span`) removed the `[role="tab"]` element itself. If you listed such selectors, they now remove what they say, so check the generated docs. The defaults behave as before.
- **Headings are read correctly.** Every Docusaurus heading used to carry its permalink into the text and id (``Setup[​](#setup "Direct link to Setup")``, id `setupsetup-direct-link-to-setup`), and `#` lines inside code blocks counted as headings. Now heading text is plain, ids are the page's real anchors (including `-1` duplicates and custom ids), code blocks are skipped, and the permalinks are gone from the Markdown. This changes `docs_fetch` output and search scores. Result order can shift where permalink text inflated a page's score, for example for a query containing "link". Custom indexers that read `DocHeading` see the corrected values.
- **The mobile "On this page" button is dropped.** `.theme-doc-toc-mobile` joins the default `excludeSelectors`, so docs pages no longer start with an `On this page` line. If you set your own `excludeSelectors`, add it to your list to get the same.

## 2.0

Follow [Migrating from 1.x to 2.0.0](/migrations/1.x-2.0.0). In short:

- **Requirements:** Node.js 22 or later and zod 4.2 or later.
- **Rebuild and redeploy `build/mcp/`.** The search index format changed, and a 1.x index is rejected with a message saying to rebuild. Deployment problems like this are `ConfigurationError`s. Their message, which says how to fix them, is returned to clients and in the `GET` status. Other errors are still reported only as `Internal server error`.
- **FlexSearch is replaced by the built-in `local` BM25 search.** Remove `flexsearch` options and values. Tune ranking at runtime with `localSearch.fieldBoosts`. Search now matches any of the query words (OR) instead of all of them, and `query` is capped at 500 characters.
- **`docsSearchTool.inputSchema` / `docsFetchTool.inputSchema` are `z.object(...)` schemas.** The raw shapes are still exported as `docsSearchInputSchema` / `docsFetchInputSchema`.
- **Unknown tools return JSON-RPC `-32602`** instead of an `isError` result.
- **Skills:** the build writes skills into the bundle. Set `skills: false` to turn them off.

**MCP clients need no changes.** 2026-07-28 and 2025-era clients are served from the same endpoint, and the guide lists the small response differences older clients see.

The full history is in the [changelog](https://github.com/scalvert/docusaurus-plugin-mcp-server/blob/main/CHANGELOG.md).
