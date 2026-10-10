---
name: deploy-docusaurus-mcp-netlify
description: Deploy a Docusaurus site and its docusaurus-plugin-mcp-server endpoint to Netlify, with the MCP endpoint as a Netlify Function at /mcp. Use when the user wants to deploy, host, or publish their docs MCP server on Netlify.
metadata:
  agent-guide: setup
  agent-guide-format: "1"
  source: https://docusaurus-plugin-mcp-server.vercel.app/docs/deploy/netlify
---

# Deploy to Netlify

## Done when

`curl https://<your-domain>/mcp` returns the status JSON with `"initialized": true`, a `docCount` above 0, and `baseUrl` on your production domain.

## Before you start

- The plugin is set up: `npm run build` writes `build/mcp/bundle.json`. If not, follow [Getting started](https://docusaurus-plugin-mcp-server.vercel.app/docs/getting-started) first.
- A Netlify account, and either the Netlify CLI (`npx netlify`) or access to the Netlify dashboard.

## How to use this guide

- Do the steps in order. Run them yourself, or walk the user through them one at a time if they'd rather do it themselves or you can't run them.
- After each step, run its check. Don't move on until it passes.
- If a check fails, look for the matching symptom under Troubleshooting. If none matches, stop and tell the user what you saw.
- A step marked **Needs the user** needs a person. Tell the user what to do and wait for them to confirm it's done.
- Ask the user before running a step marked **Confirm first**.
- Don't ask the user to paste passwords, tokens, or keys into the chat. When a step needs one, tell the user where to put it.

## Steps

### 1. Add the function {#function}

netlify/functions/mcp.mjs

```javascript
import { createWebRequestHandler } from 'docusaurus-plugin-mcp-server/adapters';
import bundle from '../../build/mcp/bundle.json' with { type: 'json' };

const handler = createWebRequestHandler({ artifacts: bundle });

export default (request) => handler(request);

export const config = { path: '/mcp' };
```

`config.path` serves the function at `/mcp` instead of the default `/.netlify/functions/mcp`. The import goes up two directories, from `netlify/functions/` to the site root.

**Check:** `netlify/functions/mcp.mjs` exists, imports `../../build/mcp/bundle.json`, and exports `config` with `path: '/mcp'`.

**If the check fails:** see [Troubleshooting](references/troubleshooting.md).

### 2. Add `netlify.toml` {#netlify-toml}

netlify.toml

```toml
[build]
  command = "npm run build"
  publish = "build"

[functions]
  node_bundler = "esbuild"
```

Netlify runs `command` first and bundles functions afterward, so the bundle exists when the function is bundled. esbuild inlines the JSON into the function.

**Check:** `netlify.toml` is next to `docusaurus.config.js`, with `publish = "build"`.

**If the check fails:** see [Troubleshooting](references/troubleshooting.md).

### 3. Set your site URL {#site-url}

Set `url` in `docusaurus.config.js` to your Netlify domain (`https://my-docs.netlify.app`) or your custom domain.

**Check:** `url` in `docusaurus.config.js` is the production domain, not `localhost` or `example.com`.

**If the check fails:** see [Results link to `localhost`, `example.com`, or the wrong domain](references/troubleshooting.md#wrong-domain).

### 4. Deploy {#deploy}

**Needs the user.**

**Confirm first.**

Connect the repository in the Netlify dashboard (**Add new project → Import an existing project**). Netlify reads `netlify.toml`, so the build settings fill themselves in.

Or deploy with the [Netlify CLI](https://docs.netlify.com/cli/get-started/):

```bash
npx netlify deploy --build          # draft deploy
npx netlify deploy --build --prod   # production deploy
```

Connecting the repository happens in the dashboard, and the first CLI deploy asks the user to log in and pick a project. Ask the user to do either, and wait for the deploy URL. `--prod` replaces the live site.

**Check:** The deploy prints a deploy URL, and the deploy shows as **Published** in the Netlify dashboard.

**If the check fails:** see [The function build fails with "Cannot find module '…/build/mcp/bundle.json'"](references/troubleshooting.md#bundle-not-found), [`ERR_IMPORT_ATTRIBUTE_MISSING`, or "needs an import attribute of type: json"](references/troubleshooting.md#import-attribute) or [`SyntaxError: Cannot use import statement outside a module`](references/troubleshooting.md#esm-syntax).

### 5. Check it {#check}

```bash
curl https://my-docs.netlify.app/mcp
```

You should get the [status JSON](https://docusaurus-plugin-mcp-server.vercel.app/docs/deploy#check-a-deployment). Then connect a client:

```bash
claude mcp add --transport http my-docs https://my-docs.netlify.app/mcp
```

**Check:** `curl https://my-docs.netlify.app/mcp` (with your domain) returns JSON with `"initialized": true` and a `docCount` above 0.

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

## Source

Generated from https://docusaurus-plugin-mcp-server.vercel.app/docs/deploy/netlify. If a step doesn't match what the user sees, tell them, and point them to that page.
