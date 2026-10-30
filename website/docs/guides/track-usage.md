---
title: Track usage
description: Send what agents search and read, and which AI tools readers set up, to your own analytics.
---

import Tabs from '@theme/Tabs';
import TabItem from '@theme/TabItem';

# Track usage

The plugin has two hooks for analytics. It sends nothing anywhere itself: you choose the backend and the fields.

| Hook | Where | Reports |
| --- | --- | --- |
| `onEvent` | Server option | Each `docs_search` and `docs_fetch` call: the tool, whether it worked, which pages a search found, which page a fetch read, and the client |
| `onCopy` | `McpInstallButton` prop | Each time a reader copies a client's setup: the client, and whether it was a command or a config |

Both are new in 2.5.

## What agents search and read

Pass `onEvent` to the adapter you deploy with. It gets one event per tool call. Every adapter takes it: `createWebRequestHandler`, `createNodeHandler`, and `createNodeServer`.

Put the analytics code in its own module, so every platform below can share it:

```javascript title="analytics.mjs"
// Send one event to your analytics service.
export async function send(fields) {
  try {
    await fetch('https://analytics.example.com/collect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(fields),
    });
  } catch (error) {
    console.error('[analytics]', error);
  }
}

// Keep only the fields that are safe to store. See the rules below.
export function fieldsOf(event) {
  return {
    tool: event.tool,
    ok: event.ok,
    page: event.tool === 'docs_fetch' ? event.documentId?.split('?')[0] : undefined,
    results: event.tool === 'docs_search' ? event.resultCount : undefined,
    top: event.tool === 'docs_search' ? event.results?.[0]?.route : undefined,
    client: event.client?.name,
  };
}
```

Replace `send` with your analytics library's call. On a server that keeps running, call it from `onEvent`. On Node:

```javascript title="mcp-server.mjs"
import { createNodeServer } from 'docusaurus-plugin-mcp-server/adapters/node';
import { fieldsOf, send } from './analytics.mjs';

createNodeServer({
  artifactsDir: './build/mcp',
  onEvent: (event) => send(fieldsOf(event)),
}).listen(3456);
```

A Bun or Deno server passes the same `onEvent` to `createWebRequestHandler`.

### On serverless platforms

The server doesn't wait for `onEvent`. A serverless platform can stop the function once the response is sent, and cancel a send that is still running.

To keep it running, keep `onEvent` as it is, so it returns the send's promise. Then pass the platform's per-request context to the handler after the request. The handler uses the first argument that has a `waitUntil` method, and the server passes it the promise. This needs version 2.6 or later.

<Tabs groupId="platform">
<TabItem value="vercel" label="Vercel">

Import `waitUntil` from [`@vercel/functions`](https://www.npmjs.com/package/@vercel/functions), and pass it in an object:

```javascript title="api/mcp.mjs"
import { waitUntil } from '@vercel/functions';
import { createWebRequestHandler } from 'docusaurus-plugin-mcp-server/adapters';
import bundle from '../build/mcp/bundle.json' with { type: 'json' };
import { fieldsOf, send } from '../analytics.mjs';

const mcp = createWebRequestHandler({
  artifacts: bundle,
  onEvent: (event) => send(fieldsOf(event)),
});

export default {
  fetch: (request) => mcp(request, { waitUntil }),
};
```

</TabItem>
<TabItem value="netlify" label="Netlify">

Netlify passes its [context](https://docs.netlify.com/build/functions/api/), which has `waitUntil`, after the request. Pass it on:

```javascript title="netlify/functions/mcp.mjs"
import { createWebRequestHandler } from 'docusaurus-plugin-mcp-server/adapters';
import bundle from '../../build/mcp/bundle.json' with { type: 'json' };
import { fieldsOf, send } from '../../analytics.mjs';

const handler = createWebRequestHandler({
  artifacts: bundle,
  onEvent: (event) => send(fieldsOf(event)),
});

export default (request, context) => handler(request, context);

export const config = { path: '/mcp' };
```

</TabItem>
<TabItem value="cloudflare" label="Cloudflare Workers">

Workers pass `env` and then [`ctx`](https://developers.cloudflare.com/workers/runtime-apis/context/), which has `waitUntil`, after the request. Pass both on:

```javascript title="worker.js"
import { createWebRequestHandler } from 'docusaurus-plugin-mcp-server/adapters';
import bundle from './build/mcp/bundle.json' with { type: 'json' };
import { fieldsOf, send } from './analytics.mjs';

const mcp = createWebRequestHandler({
  artifacts: bundle,
  onEvent: (event) => send(fieldsOf(event)),
});

export default {
  fetch(request, env, ctx) {
    if (new URL(request.url).pathname === '/mcp') {
      return mcp(request, env, ctx);
    }
    return env.ASSETS.fetch(request);
  },
};
```

A Worker that exports the handler as `fetch` directly, such as `export default { fetch: mcp }`, gets this without changes, because Workers call it with `env` and `ctx`.

</TabItem>
</Tabs>

The events answer these questions:

- **Which pages do agents read?** Count `docs_fetch` events by `documentId`. `resolved` is `'document'` when the fetch found a page, and `'not-found'` when it didn't.
- **What are agents looking for?** Count `docs_search` events by the route of their first result, `results[0].route`. It shows which pages searches surface, without storing the query. `results` is new in 2.7.
- **Which searches find nothing?** Count `docs_search` events where `resultCount` is `0`.
- **Which agents connect?** Count events by `client.name`. Only protocol 2026-07-28 requests can carry it, so 2025-era clients don't appear.

Follow these rules when you write the handler:

- **Leave out `query` and `uri`.** They're the agent's input, as sent, and can hold anything. Send them only if your analytics may store free text.
- **Remove the query string from `documentId`.** With a custom search provider, it can keep the one the agent sent.
- **Check `event.tool` before you read a tool's fields.** `resultCount` and `results` are only on search events, and `documentId` only on fetch events.
- **Return the send's promise.** On a serverless platform, also pass the request's context to the handler, as in [On serverless platforms](#on-serverless-platforms). The server logs an error from `onEvent` instead of returning it to the client.

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
