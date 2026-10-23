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
| `onEvent` | `(event) => void \| Promise<void>` | No | Called after every tool call, for analytics or logging. See [Usage events](#usage-events) |
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

## Usage events

`onEvent` is called after every `docs_search` and `docs_fetch` call. Use it to see which pages agents read, which searches find nothing, and which clients connect. Each event has these fields:

| Field | Present | Description |
| --- | --- | --- |
| `type` | Always | `'tool_call'` |
| `tool` | Always | `'docs_search'` or `'docs_fetch'` |
| `ok` | Always | `true` when the tool answered with a result, `false` when it answered with an error. A page that doesn't exist is still a result |
| `durationMs` | Always | Time the tool took, in milliseconds |
| `client` | When the request names it | `{ name, version }` of the client. Protocol 2026-07-28 requests carry it on every call. 2025-era clients send it only when they connect, so their tool calls don't have it |
| `query`, `limit` | `docs_search` | The query and result limit the call used |
| `resultCount` | `docs_search`, when `ok` | How many results the search returned. `0` is a search that found nothing |
| `uri` | `docs_fetch` | The URL, path, or `skill://` URI the agent passed |
| `resolved` | `docs_fetch`, when `ok` | What `uri` named: `'document'`, `'skill-file'`, or `'not-found'` |
| `documentId` | `docs_fetch`, when `resolved` is `'document'` | The page's absolute URL, without a fragment, whatever form the agent passed |

`query` and `uri` are the agent's input, as sent. Agents can put anything in them, so send only the fields your analytics should store:

```javascript
export default {
  fetch: createWebRequestHandler({
    artifacts: bundle,
    onEvent(event) {
      console.log(
        JSON.stringify({
          tool: event.tool,
          ok: event.ok,
          page: event.documentId,
          results: event.resultCount,
          client: event.client?.name,
        })
      );
    },
  }),
};
```

The server doesn't wait for `onEvent`, and it logs an error that `onEvent` throws or rejects with instead of returning it to the client. Some serverless platforms stop work once the response is sent. On those, pass async work to the platform's `waitUntil` so it can finish. The event types (`McpDocsEvent`, `McpEventHandler`) are exported from the main, `adapters`, and `adapters/node` entry points.

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
