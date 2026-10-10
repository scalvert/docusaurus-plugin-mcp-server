---
name: deploy-docusaurus-mcp-vercel
description: Deploy a Docusaurus site and its docusaurus-plugin-mcp-server endpoint to Vercel, with the MCP endpoint at /mcp. Use when the user wants to deploy, host, or publish their docs MCP server on Vercel.
metadata:
  agent-guide: setup
  agent-guide-format: "1"
  source: https://docusaurus-plugin-mcp-server.vercel.app/docs/deploy/vercel
---

# Deploy to Vercel

## Done when

`curl https://<your-domain>/mcp` returns the status JSON with `"initialized": true`, a `docCount` above 0, and `baseUrl` on your production domain.

## Before you start

- The plugin is set up: `npm run build` writes `build/mcp/bundle.json`. If not, follow [Getting started](https://docusaurus-plugin-mcp-server.vercel.app/docs/getting-started) first.
- A Vercel account, and either the Vercel CLI (`npx vercel`) or access to the Vercel dashboard.

## How to use this guide

- Do the steps in order. Run them yourself, or walk the user through them one at a time if they'd rather do it themselves or you can't run them.
- After each step, run its check. Don't move on until it passes.
- If a check fails, look for the matching symptom under Troubleshooting. If none matches, stop and tell the user what you saw.
- A step marked **Needs the user** needs a person. Tell the user what to do and wait for them to confirm it's done.
- Ask the user before running a step marked **Confirm first**.
- Don't ask the user to paste passwords, tokens, or keys into the chat. When a step needs one, tell the user where to put it.

## Steps

### 1. Add the function {#function}

Create `api/mcp.mjs` in your site's root, next to `docusaurus.config.js`:

api/mcp.mjs

```javascript
import { createWebRequestHandler } from 'docusaurus-plugin-mcp-server/adapters';
import bundle from '../build/mcp/bundle.json' with { type: 'json' };

export default {
  fetch: createWebRequestHandler({ artifacts: bundle }),
};
```

Vercel's Node.js runtime runs a default export with a `fetch` method as a web-standard handler. Vercel builds the function after your build command, so `build/mcp/bundle.json` exists when the function is bundled, and its file tracing includes the bundle in the function.

**Check:** `api/mcp.mjs` is next to `docusaurus.config.js` and imports `../build/mcp/bundle.json`.

**If the check fails:** see [Troubleshooting](references/troubleshooting.md).

### 2. Add `vercel.json` {#vercel-json}

vercel.json

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "framework": "docusaurus-2",
  "buildCommand": "npm run build",
  "outputDirectory": "build",
  "cleanUrls": true,
  "rewrites": [{ "source": "/mcp", "destination": "/api/mcp" }]
}
```

- `rewrites` serves the function at `/mcp`, the URL the install button advertises. The function also answers at `/api/mcp`.
- `cleanUrls` serves `docs/intro.html` at `/docs/intro`. Docusaurus writes pages that way when `trailingSlash` is `false`. Without `cleanUrls`, every page except the homepage returns 404 on Vercel. It does no harm with the default `docs/intro/index.html` layout, so keep it either way.
- `framework`, `buildCommand`, and `outputDirectory` match what Vercel detects for Docusaurus. Setting them here keeps the config in the repo rather than in the dashboard.

**Check:** `vercel.json` is next to `docusaurus.config.js`, with the `/mcp` rewrite and `"cleanUrls": true`.

**If the check fails:** see [Troubleshooting](references/troubleshooting.md).

### 3. Set your site URL {#site-url}

In `docusaurus.config.js`, set `url` to the domain you'll serve from, for example `https://my-docs.vercel.app` or your custom domain. Page URLs in tool results are built from it.

**Check:** `url` in `docusaurus.config.js` is the production domain, not `localhost` or `example.com`.

**If the check fails:** see [Results link to `localhost`, `example.com`, or the wrong domain](references/troubleshooting.md#wrong-domain).

### 4. Deploy {#deploy}

**Needs the user.**

**Confirm first.**

With the [Vercel CLI](https://vercel.com/docs/cli):

```bash
npx vercel          # preview deployment; links the project on first run
npx vercel --prod   # production deployment
```

Or import the repository in the Vercel dashboard. Then every push to the production branch deploys to production, and every other branch gets a preview. If the site is in a subdirectory of the repo, set **Root Directory** to that directory in the project settings.

The first `npx vercel` asks the user to log in and to link a project, in the terminal. Ask the user to run it, or to import the repository in the dashboard, and wait for the deployment URL. `--prod` replaces the live site.

**Check:** The deploy prints a deployment URL, and the deployment shows as **Ready** in the Vercel dashboard.

**If the check fails:** see [The function build fails with "Cannot find module '…/build/mcp/bundle.json'"](references/troubleshooting.md#bundle-not-found), [`ERR_IMPORT_ATTRIBUTE_MISSING`, or "needs an import attribute of type: json"](references/troubleshooting.md#import-attribute) or [`SyntaxError: Cannot use import statement outside a module`](references/troubleshooting.md#esm-syntax).

### 5. Check it {#check}

```bash
curl https://my-docs.vercel.app/mcp
```

You should get the [status JSON](https://docusaurus-plugin-mcp-server.vercel.app/docs/deploy#check-a-deployment) with your document count. Then connect a client:

```bash
claude mcp add --transport http my-docs https://my-docs.vercel.app/mcp
```

**Check:** `curl https://my-docs.vercel.app/mcp` (with your domain) returns JSON with `"initialized": true` and a `docCount` above 0.

**If the check fails:** see [`/mcp` returns 404, or your site's 404 page](references/troubleshooting.md#mcp-404), [The status check returns 500 with an `error` message](references/troubleshooting.md#status-500), [Results link to `localhost`, `example.com`, or the wrong domain](references/troubleshooting.md#wrong-domain) or [The endpoint serves old content](references/troubleshooting.md#old-content).

## Troubleshooting

- [`/mcp` returns 404, or your site's 404 page](references/troubleshooting.md#mcp-404)
- [Docs pages return 404, but the homepage and `/mcp` work](references/troubleshooting.md#docs-404)
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

## Source

Generated from https://docusaurus-plugin-mcp-server.vercel.app/docs/deploy/vercel. If a step doesn't match what the user sees, tell them, and point them to that page.
