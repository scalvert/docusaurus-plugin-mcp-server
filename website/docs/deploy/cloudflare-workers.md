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

## 3. Set your site URL

Set `url` in `docusaurus.config.js` to the Worker's domain (`https://my-docs.<your-subdomain>.workers.dev`) or the custom domain you'll attach.

## 4. Deploy

```bash
npm install --save-dev wrangler
npm run build
npx wrangler deploy
```

Wrangler bundles `worker.js` with esbuild, which inlines `bundle.json`, and uploads `build/` as assets. Always run `npm run build` first. Wrangler bundles whatever `build/mcp/bundle.json` is on disk.

To build and deploy from Git instead, connect the repository in **Workers & Pages → Create → Import a repository**. Set the build command to `npm run build` and the deploy command to `npx wrangler deploy`.

## 5. Check it

```bash
curl https://my-docs.<your-subdomain>.workers.dev/mcp
```

You should get the [status JSON](./index.md#check-a-deployment). Then connect a client:

```bash
claude mcp add --transport http my-docs https://my-docs.<your-subdomain>.workers.dev/mcp
```

To try it locally first, run `npx wrangler dev` and use `http://localhost:8787/mcp`.

## Notes

- **Size limit.** The bundle is part of the Worker script. Workers allow 3 MB (Free) or 10 MB (Paid) after compression. The plugin and its dependencies add about 180 KB compressed, and the rest is your bundle. Check with `npx wrangler deploy --dry-run`, which prints the total upload size. A very large site may need the Paid plan, or a [custom search provider](../guides/custom-providers.md) that keeps the index outside the Worker.
- **Startup.** The server is created on the first request and reused while the isolate stays warm, so module scope stays cheap.
- **Cloudflare Pages.** This guide uses Workers with static assets, which Cloudflare recommends for new projects. The handler is the same on Pages: call `mcp(request)` from a Pages Function at `functions/mcp.js`.

Something not working? See [Troubleshooting](./troubleshooting.md).
