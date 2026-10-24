---
title: Track usage
description: Send what agents search and read, and which AI tools readers set up, to your own analytics.
---

# Track usage

The plugin has two hooks for analytics. It sends nothing anywhere itself: you choose the backend and the fields.

| Hook | Where | Reports |
| --- | --- | --- |
| `onEvent` | Server option | Each `docs_search` and `docs_fetch` call: the tool, whether it worked, how many results a search found, which page a fetch read, and the client |
| `onCopy` | `McpInstallButton` prop | Each time a reader copies a client's setup: the client, and whether it was a command or a config |

Both are new in 2.5.

## What agents search and read

Pass `onEvent` to the handler. It gets one event per tool call. This Vercel function sends each one to an analytics endpoint:

```javascript title="api/mcp.mjs"
import { waitUntil } from '@vercel/functions';
import { createWebRequestHandler } from 'docusaurus-plugin-mcp-server/adapters';
import bundle from '../build/mcp/bundle.json' with { type: 'json' };

function send(fields) {
  return fetch('https://analytics.example.com/collect', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(fields),
  }).catch((error) => console.error('[analytics]', error));
}

export default {
  fetch: createWebRequestHandler({
    artifacts: bundle,
    onEvent(event) {
      waitUntil(
        send({
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

Replace `send` with your analytics library's call. The events answer these questions:

- **Which pages do agents read?** Count `docs_fetch` events by `documentId`. `resolved` is `'document'` when the fetch found a page, and `'not-found'` when it didn't.
- **Which searches find nothing?** Count `docs_search` events where `resultCount` is `0`.
- **Which agents connect?** Count events by `client.name`. Only protocol 2026-07-28 requests can carry it, so 2025-era clients don't appear.

Follow these rules when you write the handler:

- **Leave out `query` and `uri`.** They're the agent's input, as sent, and can hold anything. Send them only if your analytics may store free text.
- **Remove the query string from `documentId`.** With a custom search provider, it can keep the one the agent sent.
- **Check `event.tool` before you read a tool's fields.** `resultCount` is only on search events, and `documentId` only on fetch events.
- **Hand async work to the platform.** The server doesn't wait for `onEvent`, and it logs an error from it instead of returning one to the client. Serverless platforms can stop work once the response is sent, so pass the send to the platform's `waitUntil`, as the sample does with Vercel's.

Every field, and when it's present, is in [Usage events](../reference/server-options.md#usage-events).

## Which AI tools readers set up

Pass `onCopy` to `McpInstallButton`. It's called after each successful copy, with the client's ID and `kind`: `'command'` for a CLI command, or `'config'` for a configuration snippet. A failed copy doesn't call it.

For the navbar button, pass it in your navbar item component ([Add it to the navbar](./install-button.md#add-it-to-the-navbar)):

```jsx title="src/theme/NavbarItem/McpInstallNavbarItem.js"
<McpInstallButton
  label="Install MCP"
  onCopy={({ client, kind }) => analytics.track('mcp_install_copied', { client, kind })}
/>
```

Replace `analytics.track` with your analytics library's call. Both values come from a fixed set, so they're safe to send.

## Check that events arrive

1. Run the server locally ([Run the server locally](../getting-started.md#4-run-the-server-locally)), with `onEvent(event) { console.log(event); }` in the options.
2. Call `docs_search` from the MCP Inspector ([Testing the endpoint](./testing.md#mcp-inspector)).
3. Check that the server logs one event with `tool: 'docs_search'`. A call with invalid arguments, such as an empty query, logs none, because the MCP SDK rejects it before it reaches the tool.
