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
| `instructions` | `string` | No | Instructions for using the server, sent to clients in the `server/discover` (2026-07-28) or `initialize` (2025-era) result. When skills are served, the server adds a pointer to them. See [Instructions sent to clients](#instructions-sent-to-clients) |
| `tools` | `object` | No | Per-tool overrides: `docs_search.description` and `docs_fetch.description` |
| `search` | `string \| SearchRanker` | No | Search provider: a module name or path (relative to the server's working directory), or an instance. Default: the built-in `'local'` search. See [Custom providers](../guides/custom-providers.md#searchprovider) |
| `localSearch` | `{ fieldBoosts?: {...} }` | No | Field boosts for the built-in search. See [Search](../guides/search.md#tune-field-boosts) |
| `onEvent` | `(event) => void \| Promise<void>` | No | Called after each `docs_search` and `docs_fetch` call that reaches the tool, for analytics or logging. See [Usage events](#usage-events) |
| `corsOrigin` | `string` (Node: `string \| false`) | No | Value of `Access-Control-Allow-Origin`. Default: `'*'`. On the Node adapter, `false` sends no CORS headers. Handlers only, not `McpDocsServer` |

\*Pass `artifacts` (serverless and edge, or `McpDocsServer` directly) or `artifactsDir` (Node). In Node, `readArtifactBundle(dir)` from `docusaurus-plugin-mcp-server/adapters/node` returns the `artifacts` value.

The 2.0/2.1 configs (`docsPath`/`indexPath`/`skillsPath`, or `docs`/`searchIndexData`/`skills` with a required `name`) still work through 2.x, but are deprecated and removed in 3.0. See [Upgrading](../upgrading.md).

## Example

```javascript
import { createWebRequestHandler } from 'docusaurus-plugin-mcp-server/adapters';
import bundle from './build/mcp/bundle.json' with { type: 'json' };

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

## Instructions sent to clients

When the server serves at least one skill, it adds a pointer to the skills after your `instructions`, separated by a blank line. Clients that don't support the skills extension find the skills this way. The pointer is a fixed paragraph that tells the agent to read a matching skill with `docs_fetch` before it starts a task, then one line per skill:

```text
- skill://docs-research/SKILL.md: <the skill's description>
```

Without `instructions`, the server sends the pointer alone. With no skills, it sends your `instructions` unchanged, and with neither, it sends none.

## Usage events

[Track usage](../guides/track-usage.md) shows how to send these events to your analytics, with the install button's copy events.

`onEvent` is called after each `docs_search` and `docs_fetch` call that reaches the tool. Use it to see which pages agents read, which searches find nothing, and which clients connect. A call that the MCP SDK rejects first, such as a call with invalid arguments or to an unknown tool, doesn't reach the tool and has no event. Each event has these fields:

| Field | Present | Description |
| --- | --- | --- |
| `type` | Always | `'tool_call'` |
| `tool` | Always | `'docs_search'` or `'docs_fetch'` |
| `ok` | Always | `true` when the tool answered with a result, `false` when it answered with an error. A page that doesn't exist is still a result |
| `durationMs` | Always | Time the tool took, in milliseconds |
| `client` | When the request names it | `{ name, version? }` of the client. On protocol 2026-07-28, a request names its client when the client includes its info, as the TypeScript SDK client does on every call. 2025-era clients send it only when they connect, so their tool calls don't have it |
| `query`, `limit` | `docs_search` | The query and result limit the call used |
| `resultCount` | `docs_search`, when `ok` | How many results the search returned. `0` is a search that found nothing |
| `uri` | `docs_fetch` | The URL, path, or `skill://` URI the agent passed |
| `resolved` | `docs_fetch`, when `ok` | What `uri` named: `'document'`, `'skill-file'`, or `'not-found'` |
| `documentId` | `docs_fetch`, when `resolved` is `'document'` | The ID of the page `uri` named, whatever form `uri` took. For a bundle the plugin builds, it's the page's absolute URL, without a fragment or query string. A [custom provider](../guides/custom-providers.md#searchprovider) whose `getDocument` accepts the URL as sent makes that URL the ID, without its fragment but with any query string |

`query` and `uri` are the agent's input, as sent. Agents can put anything in them, so send only the fields your analytics should store. With a custom provider, `documentId` can hold agent input too, so remove its query string before you store it. Check `event.tool` before you read a tool's fields:

```javascript
import { createWebRequestHandler } from 'docusaurus-plugin-mcp-server/adapters';
import bundle from './build/mcp/bundle.json' with { type: 'json' };

export default {
  fetch: createWebRequestHandler({
    artifacts: bundle,
    onEvent(event) {
      console.log(
        JSON.stringify({
          tool: event.tool,
          ok: event.ok,
          page: event.tool === 'docs_fetch' ? event.documentId?.split('?')[0] : undefined,
          results: event.tool === 'docs_search' ? event.resultCount : undefined,
          client: event.client?.name,
        })
      );
    },
  }),
};
```

The server doesn't wait for `onEvent`, and it logs an error that `onEvent` throws or rejects with instead of returning it to the client. Some serverless platforms stop work once the response is sent. On those, return the promise from `onEvent`, and pass the platform's per-request context to the handler after the request. The server gives the promise to the context's `waitUntil` (since 2.6). [On serverless platforms](../guides/track-usage.md#on-serverless-platforms) shows it for Vercel, Netlify, and Cloudflare Workers.

The event types (`McpDocsEvent`, `McpEventHandler`) are exported from the main, `adapters`, and `adapters/node` entry points. `WaitUntil` is exported from the main and `adapters` entry points.

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
