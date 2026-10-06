---
title: Server options
description: Options for createWebRequestHandler, createNodeHandler, createNodeServer, and McpDocsServer.
---

# Server options

These options apply where the MCP server runs: `createWebRequestHandler`, `createNodeServer`, `createNodeHandler`, and `McpDocsServer`. They aren't plugin options. The plugin only builds the artifact bundle.

| Option | Type | Required | Description |
| --- | --- | --- | --- |
| `artifacts` | `object` | Yes\* | The artifact bundle: the contents of `build/mcp/bundle.json` |
| `artifactsDir` | `string` | Yes\* | Directory holding the bundle, such as `./build/mcp`. `createNodeServer` and `createNodeHandler` only |
| `name` | `string` | No | Server name. Default: the plugin's `server.name` from the build |
| `version` | `string` | No | Server version. Default: the plugin's `server.version` from the build |
| `baseUrl` | `string` | No | Site URL reported by the status check and passed to search providers. Default: the site URL from the build. Page URLs in tool results always come from the build. To change them, set `url` in `docusaurus.config.js` and rebuild |
| `instructions` | `string` | No | Instructions for using the server, sent to clients in the `server/discover` (2026-07-28) or `initialize` (2025-era) result. When skills are served, their URIs are appended |
| `tools` | `object` | No | Per-tool overrides: `docs_search.description` and `docs_fetch.description` |
| `search` | `string \| SearchRanker` | No | Search provider: a module name or path (relative to the server's working directory), or an instance. Default: the built-in `'local'` search. See [Custom providers](../guides/custom-providers.md#searchprovider) |
| `localSearch` | `{ fieldBoosts?: {...} }` | No | Field boosts for the built-in search. See [Search](../guides/search.md#tune-field-boosts) |
| `corsOrigin` | `string` (Node: `string \| false`) | No | Value of `Access-Control-Allow-Origin`. Default: `'*'`. On the Node adapter, `false` sends no CORS headers. Handlers only, not `McpDocsServer` |

\*Pass `artifacts` (serverless and edge, or `McpDocsServer` directly) or `artifactsDir` (Node). In Node, `readArtifactBundle(dir)` from `docusaurus-plugin-mcp-server/adapters/node` returns the `artifacts` value.

The 2.0/2.1 configs (`docsPath`/`indexPath`/`skillsPath`, or `docs`/`searchIndexData`/`skills` with a required `name`) still work through 2.x, but are deprecated and removed in 3.0. See [Upgrading](../upgrading.md).

## Example

```javascript
export default {
  fetch: createWebRequestHandler({
    artifacts: bundle,
    instructions:
      'Search the Acme product docs. Use docs_search to find pages, then docs_fetch for full content.',
    tools: {
      docs_search: { description: 'Search the Acme product documentation.' },
      docs_fetch: { description: 'Fetch the full markdown of an Acme docs page.' },
    },
    corsOrigin: 'https://app.acme.dev',
  }),
};
```

## HTTP behavior

Every handler follows the same rules:

| Request | Response |
| --- | --- |
| `OPTIONS` | `204` with CORS headers (the preflight) |
| `GET` | `200` with the status JSON, or `500` with `{ "error": "…" }` if the bundle can't be loaded |
| `POST` | The MCP response |
| anything else | `405` with a JSON-RPC error |

The handlers answer on whatever path they're mounted at. Routing `/mcp` to them is the platform's job.

Errors caused by the deployment (a stale bundle, a missing search index) are `ConfigurationError`s, and their message, which says how to fix them, is returned to clients. Other errors are reported as `Internal server error` and logged.

The Node adapter also limits request bodies to 1 MB and pretty-prints the status JSON.
