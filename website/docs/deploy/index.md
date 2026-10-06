---
title: Deploy
description: What a deployment of the MCP endpoint consists of, the rules every platform follows, and how to check it works.
sidebar_label: Overview
---

# Deploy

A deployment has two parts, and both come from one `docusaurus build`:

1. **Your static site**, the `build/` directory, served as usual.
2. **One function at `/mcp`** that imports `build/mcp/bundle.json` and passes it to the plugin's handler.

The function is about five lines. Most of the work in each guide is getting the platform to route `/mcp` to it and to bundle it _after_ the site is built.

## Pick your platform

| Platform | Function file | Route to `/mcp` |
| --- | --- | --- |
| [Vercel](./vercel.md) | `api/mcp.mjs` | `rewrites` in `vercel.json` |
| [Netlify](./netlify.md) | `netlify/functions/mcp.mjs` | `config.path` in the function |
| [Cloudflare Workers](./cloudflare-workers.md) | `worker.js` | `assets.run_worker_first` in `wrangler.jsonc` |
| [Deno Deploy](./deno-and-bun.md#deno) | `main.js` | your `Deno.serve` handler |
| [Bun](./deno-and-bun.md#bun) | `server.js` | `routes` in `Bun.serve` |
| [Node.js / Express](./node.md) | `server.mjs` | `app.all('/mcp', …)` |
| [GitHub Pages, S3, other static hosts](./static-hosts.md) | on another host | `server.url` in the plugin options |

This site is deployed with the [Vercel](./vercel.md) setup, from CI on release tags.

## Rules for every platform

### Set `url` before you build

The server builds every page URL it returns from `url` in `docusaurus.config.js`, and it reads it at build time. Set it to the domain the site is served from. If you change domains, rebuild and redeploy.

### Serve the endpoint at `/mcp`, or say where it is

The install button and the plugin's global data advertise `{url}/mcp`. Route the function to exactly that path. If the endpoint lives somewhere else (another path, a subdomain, another host), set [`server.url`](../reference/plugin-options.md) so the advertised URL matches.

### Import the bundle as JSON

Serverless and edge runtimes can't read your build directory at runtime, so the function imports the bundle as a module and the platform bundles it in:

```javascript
import bundle from '../build/mcp/bundle.json' with { type: 'json' };
```

Keep `with { type: 'json' }`. Node.js and Deno require it to import JSON, and esbuild, Wrangler, and Bun accept it, so one form works everywhere.

### Build the site before the function is bundled

The import fails if `build/mcp/bundle.json` doesn't exist yet. Every guide here uses a platform that runs your build command first and bundles functions afterward. If you write your own pipeline, run `docusaurus build` first.

### Redeploy the function with the site

The bundle is baked into the function, so the function serves the docs from the build it was deployed with. Deploy the site and the function together, from the same build. A bundle from an older plugin version is rejected with a message telling you to rebuild.

### Use a file name your runtime treats as ES modules

Function examples use `.mjs` because most Docusaurus sites don't set `"type": "module"` in `package.json`. If yours does, `.js` works too.

## Check a deployment

Run these against your production URL after every first deploy.

**1. The status check.** A `GET` returns the server's status:

```bash
curl https://docs.example.com/mcp
```

```json
{
  "name": "my-docs",
  "version": "1.0.0",
  "initialized": true,
  "docCount": 42,
  "skillCount": 1,
  "baseUrl": "https://docs.example.com/",
  "searchProvider": "local"
}
```

Check that `docCount` matches what `docusaurus-mcp-verify` reported and that `baseUrl` is your production domain. An `{"error": "..."}` body with status 500 says what's wrong with the deployment.

**2. A tool call.** Search over MCP:

```bash
curl -X POST https://docs.example.com/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"docs_search","arguments":{"query":"getting started"}}}'
```

The result lists pages with URLs on your domain.

**3. A real client.** Connect with the [MCP Inspector](../guides/testing.md#mcp-inspector) or [your AI tool](../guides/connect-clients.md).

If any of these fail, see [Troubleshooting](./troubleshooting.md).

## Security

The endpoint is read-only and serves the same content as your public site. It's unauthenticated and allows every origin (`Access-Control-Allow-Origin: *`) by default. To restrict browser access, pass `corsOrigin` to the handler. The build also leaves the bundle files in `build/mcp/`, so they're downloadable as static files. They contain only your published pages.

For a private docs site, put the endpoint behind the same access control as the site, such as Vercel Deployment Protection or Cloudflare Access.
