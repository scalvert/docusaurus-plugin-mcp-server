---
name: deploy-docusaurus-mcp-cloudflare
description: Deploy a Docusaurus site and its docusaurus-plugin-mcp-server endpoint to Cloudflare Workers, serving the site as static assets and MCP at /mcp. Use when the user wants to deploy, host, or publish their docs MCP server on Cloudflare.
metadata:
  agent-guide: setup
  agent-guide-format: "1"
  source: https://docusaurus-plugin-mcp-server.vercel.app/docs/deploy/cloudflare-workers
---

# Deploy to Cloudflare Workers

## Done when

`curl https://<your-domain>/mcp` returns the status JSON with `"initialized": true`, a `docCount` above 0, and `baseUrl` on your production domain.

## Before you start

- The plugin is set up: `npm run build` writes `build/mcp/bundle.json`. If not, follow [Getting started](https://docusaurus-plugin-mcp-server.vercel.app/docs/getting-started) first.
- A Cloudflare account.

## How to use this guide

- Do the steps in order. Run them yourself, or walk the user through them one at a time if they'd rather do it themselves or you can't run them.
- After each step, run its check. Don't move on until it passes.
- If a check fails, look for the matching symptom under Troubleshooting. If none matches, stop and tell the user what you saw.
- A step marked **Needs the user** needs a person. Tell the user what to do and wait for them to confirm it's done.
- Ask the user before running a step marked **Confirm first**.
- Don't ask the user to paste passwords, tokens, or keys into the chat. When a step needs one, tell the user where to put it.

## Steps

### 1. Add the Worker {#worker}

worker.js

```javascript
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

**Check:** `worker.js` is next to `docusaurus.config.js` and imports `./build/mcp/bundle.json`.

**If the check fails:** see [Troubleshooting](references/troubleshooting.md).

### 2. Add `wrangler.jsonc` {#wrangler}

wrangler.jsonc

```json
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

**Check:** `wrangler.jsonc` is next to `docusaurus.config.js`, with `assets.directory` set to `./build` and `run_worker_first` set to `["/mcp"]`.

**If the check fails:** see [Troubleshooting](references/troubleshooting.md).

### 3. Set your site URL {#site-url}

Set `url` in `docusaurus.config.js` to the Worker's domain (`https://my-docs.<your-subdomain>.workers.dev`) or the custom domain you'll attach.

**Check:** `url` in `docusaurus.config.js` is the production domain, not `localhost` or `example.com`.

**If the check fails:** see [Results link to `localhost`, `example.com`, or the wrong domain](references/troubleshooting.md#wrong-domain).

### 4. Deploy {#deploy}

**Needs the user.**

**Confirm first.**

```bash
npm install --save-dev wrangler
npm run build
npx wrangler deploy
```

Wrangler bundles `worker.js` with esbuild, which inlines `bundle.json`, and uploads `build/` as assets. Always run `npm run build` first. Wrangler bundles whatever `build/mcp/bundle.json` is on disk.

To build and deploy from Git instead, connect the repository in **Workers & Pages → Create → Import a repository**. Set the build command to `npm run build` and the deploy command to `npx wrangler deploy`.

The first `npx wrangler deploy` opens a browser for the user to log in to Cloudflare. Ask the user to run it, or to connect the repository in the dashboard, and wait for the Worker URL. Deploying replaces the live Worker.

**Check:** `npx wrangler deploy` prints the Worker's `workers.dev` URL.

**If the check fails:** see [The function build fails with "Cannot find module '…/build/mcp/bundle.json'"](references/troubleshooting.md#bundle-not-found) or [Cloudflare: "Script startup exceeded CPU time limit" or "script too large"](references/troubleshooting.md#cloudflare-limits).

### 5. Check it {#check}

```bash
curl https://my-docs.<your-subdomain>.workers.dev/mcp
```

You should get the [status JSON](https://docusaurus-plugin-mcp-server.vercel.app/docs/deploy#check-a-deployment). Then connect a client:

```bash
claude mcp add --transport http my-docs https://my-docs.<your-subdomain>.workers.dev/mcp
```

To try it locally first, run `npx wrangler dev` and use `http://localhost:8787/mcp`.

**Check:** `curl https://my-docs.<your-subdomain>.workers.dev/mcp` (with your domain) returns JSON with `"initialized": true` and a `docCount` above 0.

**If the check fails:** see [`/mcp` returns 404, or your site's 404 page](references/troubleshooting.md#mcp-404), [The status check returns 500 with an `error` message](references/troubleshooting.md#status-500), [Results link to `localhost`, `example.com`, or the wrong domain](references/troubleshooting.md#wrong-domain) or [The endpoint serves old content](references/troubleshooting.md#old-content).

## Troubleshooting

- [`/mcp` returns 404, or your site's 404 page](references/troubleshooting.md#mcp-404)
- [The function build fails with "Cannot find module '…/build/mcp/bundle.json'"](references/troubleshooting.md#bundle-not-found)
- [`ERR_IMPORT_ATTRIBUTE_MISSING`, or "needs an import attribute of type: json"](references/troubleshooting.md#import-attribute)
- [`SyntaxError: Cannot use import statement outside a module`](references/troubleshooting.md#esm-syntax)
- [The status check returns 500 with an `error` message](references/troubleshooting.md#status-500)
- [Tool calls return 406 Not Acceptable](references/troubleshooting.md#not-acceptable)
- [Tool calls return 405 Method Not Allowed](references/troubleshooting.md#method-not-allowed)
- [Results link to `localhost`, `example.com`, or the wrong domain](references/troubleshooting.md#wrong-domain)
- [The install button shows the wrong URL](references/troubleshooting.md#install-button-url)
- [The endpoint serves old content](references/troubleshooting.md#old-content)
- [A browser-based client is blocked by CORS](references/troubleshooting.md#cors)
- [Cloudflare: "Script startup exceeded CPU time limit" or "script too large"](references/troubleshooting.md#cloudflare-limits)

## Source

Generated from https://docusaurus-plugin-mcp-server.vercel.app/docs/deploy/cloudflare-workers. If a step doesn't match what the user sees, tell them, and point them to that page.
