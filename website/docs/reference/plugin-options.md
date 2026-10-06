---
title: Plugin options
description: Every option the Docusaurus plugin accepts in docusaurus.config.js, with defaults.
---

# Plugin options

These go in `docusaurus.config.js` and control what the build produces. Options for the running server are on the handler instead: see [Server options](./server-options.md).

```javascript title="docusaurus.config.js"
module.exports = {
  plugins: [
    [
      'docusaurus-plugin-mcp-server',
      {
        server: { name: 'my-docs', version: '1.0.0' },
        excludeRoutes: ['/404*', '/search*', '/blog/tags/**'],
      },
    ],
  ],
};
```

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `server.name` | `string` | `'docs-mcp-server'` | Name of the MCP server |
| `server.version` | `string` | `'1.0.0'` | Version of the MCP server |
| `server.url` | `string` | derived | The endpoint URL the install button and global data advertise. Set it when the endpoint isn't at `{url}/{outputDir}` |
| `server.urlBase` | `'origin' \| 'site'` | `'origin'` | How to derive the endpoint URL when `server.url` isn't set. `'origin'` → `{url}/{outputDir}`; `'site'` → under the Docusaurus `baseUrl` |
| `outputDir` | `string` | `'mcp'` | Directory for the artifact bundle, relative to the build directory |
| `contentSelectors` | `string[]` | see below | CSS selectors for a page's main content, in priority order. Invalid selectors are skipped with a build warning |
| `excludeSelectors` | `string[]` | see below | CSS selectors for elements to remove from the content. Full CSS since 2.2. Invalid selectors are skipped with a build warning |
| `minContentLength` | `number` | `50` | Pages with less extracted text than this are skipped |
| `excludeRoutes` | `string[]` | `['/404*', '/search*']` | Glob patterns for routes to leave out |
| `indexers` | `string[] \| false` | `['local']` | Indexers to run at build time: `'local'` (built-in), a path (relative to the site directory), or an npm package. `false` turns indexing off |
| `skills` | `{ builtin?: boolean; dir?: string } \| false` | built-in skill only | [Agent Skills](../guides/agent-skills.md) to package. `dir` is relative to the site directory. `false` turns skills off |
| `search` | `string` | `'local'` | **Deprecated since 2.2, removed in 3.0.** Has had no effect since 2.0. Choose the search provider with the [server's `search` option](./server-options.md). `'flexsearch'` is rejected |

## Default selectors

**Content selectors**, in priority order. The first one that matches is used:

```javascript snippet=readme/snippet-11.js
['article', 'main', '.main-wrapper', '[role="main"]'];
```

**Exclude selectors**, removed from the content before conversion:

```javascript snippet=readme/snippet-12.js
[
  'nav',
  'header',
  'footer',
  'aside',
  '[role="navigation"]',
  '[role="banner"]',
  '[role="contentinfo"]',
  '.theme-doc-toc-mobile',
];
```

Setting `excludeSelectors` replaces the defaults, so include the ones you want to keep.

## Endpoint URL examples

| `url` | `baseUrl` | Options | Advertised endpoint |
| --- | --- | --- | --- |
| `https://docs.example.com` | `/` | _(none)_ | `https://docs.example.com/mcp` |
| `https://example.com` | `/docs/` | _(none)_ | `https://example.com/mcp` |
| `https://example.com` | `/docs/` | `server.urlBase: 'site'` | `https://example.com/docs/mcp` |
| `https://my-org.github.io` | `/my-docs/` | `server.url: 'https://mcp.example.com/mcp'` | `https://mcp.example.com/mcp` |

[`resolveServerUrl`](./api.md#resolveserverurl) computes the same value in code.
