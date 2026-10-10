---
title: Deploy to Cloudflare Workers
description: Serve a Docusaurus site as Workers static assets, with a Worker that answers MCP requests at /mcp.
sidebar_label: Cloudflare Workers
---

# Deploy to Cloudflare Workers

A Worker with [static assets](https://developers.cloudflare.com/workers/static-assets/) serves `build/` directly from Cloudflare's network. `run_worker_first` sends only `/mcp` to your Worker script, and every other request is served as a static file without running it.

```text
my-docs/
├── docs/
├── docusaurus.config.js
├── package.json
├── worker.js            ← new: the MCP endpoint
└── wrangler.jsonc       ← new: Worker and assets config
```

<AgentGuide
  name="deploy-docusaurus-mcp-cloudflare"
  kind="setup"
  description="Deploy a Docusaurus site and its docusaurus-plugin-mcp-server endpoint to Cloudflare Workers, serving the site as static assets and MCP at /mcp. Use when the user wants to deploy, host, or publish their docs MCP server on Cloudflare.">

<DoneWhen>

`curl https://<your-domain>/mcp` returns the status JSON with `"initialized": true`, a `docCount` above 0, and `baseUrl` on your production domain.

</DoneWhen>

<Prerequisites>

- The plugin is set up: `npm run build` writes `build/mcp/bundle.json`. If not, follow [Getting started](../getting-started.md) first.
- A Cloudflare account.

</Prerequisites>

<Step id="worker">

## 1. Add the Worker

```javascript title="worker.js"
import { createWebRequestHandler } from 'docusaurus-plugin-mcp-server/adapters';
import bundle from './build/mcp/bundle.json' with { type: 'json' };

const mcp = createWebRequestHandler({ artifacts: bundle });

export default {
  fetch(request, env) {
    if (new URL(request.url).pathname === '/mcp') {
      return mcp(request);
    }
    return env.ASSETS.fetch(request);
  },
};
```

The `env.ASSETS.fetch` fallback only runs if you add more paths to `run_worker_first`. The adapter entry point imports no Node.js built-ins, so you don't need the `nodejs_compat` flag.

<Check>

`worker.js` is next to `docusaurus.config.js` and imports `./build/mcp/bundle.json`.

</Check>

</Step>

<Step id="wrangler">

## 2. Add `wrangler.jsonc`

```json title="wrangler.jsonc"
{
  "name": "my-docs",
  "main": "worker.js",
  "compatibility_date": "2026-10-01",
  "assets": {
    "directory": "./build",
    "binding": "ASSETS",
    "not_found_handling": "404-page",
    "run_worker_first": ["/mcp"]
  }
}
```

- `run_worker_first: ["/mcp"]` sends `/mcp` to the Worker before static assets are checked.
- `not_found_handling: "404-page"` serves Docusaurus's `404.html` for unknown paths.
- Set `compatibility_date` to the day you create the Worker.

<Check>

`wrangler.jsonc` is next to `docusaurus.config.js`, with `assets.directory` set to `./build` and `run_worker_first` set to `["/mcp"]`.

</Check>

</Step>

<Step id="site-url" symptoms="wrong-domain">

## 3. Set your site URL

Set `url` in `docusaurus.config.js` to the Worker's domain (`https://my-docs.<your-subdomain>.workers.dev`) or the custom domain you'll attach.

<Check>

`url` in `docusaurus.config.js` is the production domain, not `localhost` or `example.com`.

</Check>

</Step>

<Step id="deploy" needs="user" confirm symptoms="bundle-not-found cloudflare-limits">

## 4. Deploy

```bash
npm install --save-dev wrangler
npm run build
npx wrangler deploy
```

Wrangler bundles `worker.js` with esbuild, which inlines `bundle.json`, and uploads `build/` as assets. Always run `npm run build` first. Wrangler bundles whatever `build/mcp/bundle.json` is on disk.

To build and deploy from Git instead, connect the repository in **Workers & Pages → Create → Import a repository**. Set the build command to `npm run build` and the deploy command to `npx wrangler deploy`.

<ForAgents>

The first `npx wrangler deploy` opens a browser for the user to log in to Cloudflare. Ask the user to run it, or to connect the repository in the dashboard, and wait for the Worker URL. Deploying replaces the live Worker.

</ForAgents>

<Check>

`npx wrangler deploy` prints the Worker's `workers.dev` URL.

</Check>

</Step>

<Step id="check" symptoms="mcp-404 status-500 wrong-domain old-content">

## 5. Check it

```bash
curl https://my-docs.<your-subdomain>.workers.dev/mcp
```

You should get the [status JSON](./index.md#check-a-deployment). Then connect a client:

```bash
claude mcp add --transport http my-docs https://my-docs.<your-subdomain>.workers.dev/mcp
```

To try it locally first, run `npx wrangler dev` and use `http://localhost:8787/mcp`.

<Check>

`curl https://my-docs.<your-subdomain>.workers.dev/mcp` (with your domain) returns JSON with `"initialized": true` and a `docCount` above 0.

</Check>

</Step>

</AgentGuide>

## Notes

- **Size limit.** The bundle is part of the Worker script. Workers allow 3 MB (Free) or 10 MB (Paid) after compression. The plugin and its dependencies add about 180 KB compressed, and the rest is your bundle. Check with `npx wrangler deploy --dry-run`, which prints the total upload size. A very large site may need the Paid plan, or a [custom search provider](../guides/custom-providers.md) that keeps the index outside the Worker.
- **Startup.** The server is created on the first request and reused while the isolate stays warm, so module scope stays cheap.
- **Cloudflare Pages.** This guide uses Workers with static assets, which Cloudflare recommends for new projects. The handler is the same on Pages: call `mcp(request)` from a Pages Function at `functions/mcp.js`.

Something not working? See [Troubleshooting](./troubleshooting.md).
