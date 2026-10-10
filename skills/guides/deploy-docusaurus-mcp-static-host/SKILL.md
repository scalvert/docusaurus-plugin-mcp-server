---
name: deploy-docusaurus-mcp-static-host
description: Keep a Docusaurus site on GitHub Pages or another static host, and run its docusaurus-plugin-mcp-server endpoint on a Cloudflare Worker deployed from the same build. Use when the user's docs are on a static host that can't run functions and they want an MCP server for them.
metadata:
  agent-guide: setup
  agent-guide-format: "1"
  source: https://docusaurus-plugin-mcp-server.vercel.app/docs/deploy/static-hosts
---

# GitHub Pages and other static hosts

## Done when

The endpoint's status check returns `"initialized": true` with `baseUrl` on the static site's URL, and the site's install button shows the endpoint URL.

## Before you start

- The plugin is set up: `npm run build` writes `build/mcp/bundle.json`. If not, follow [Getting started](https://docusaurus-plugin-mcp-server.vercel.app/docs/getting-started) first.
- The site is in a GitHub repository, and you have a Cloudflare account.

## How to use this guide

- Do the steps in order. Run them yourself, or walk the user through them one at a time if they'd rather do it themselves or you can't run them.
- After each step, run its check. Don't move on until it passes.
- If a check fails, look for the matching symptom under Troubleshooting. If none matches, stop and tell the user what you saw.
- A step marked **Needs the user** needs a person. Tell the user what to do and wait for them to confirm it's done.
- Ask the user before running a step marked **Confirm first**.
- Don't ask the user to paste passwords, tokens, or keys into the chat. When a step needs one, tell the user where to put it.

## Steps

### 1. Point the plugin at the endpoint {#server-url}

docusaurus.config.js

```javascript
export default {
  url: 'https://my-org.github.io',
  baseUrl: '/my-docs/',
  plugins: [
    [
      'docusaurus-plugin-mcp-server',
      {
        server: {
          name: 'my-docs',
          url: 'https://my-docs-mcp.my-subdomain.workers.dev/mcp',
        },
      },
    ],
  ],
};
```

Page URLs in tool results still come from `url` and `baseUrl`, so they link to GitHub Pages.

**Check:** `server.url` in `docusaurus.config.js` is the Worker's `/mcp` URL, and `url` and `baseUrl` are the static site's.

**If the check fails:** see [The install button shows the wrong URL](references/troubleshooting.md#install-button-url) or [Results link to `localhost`, `example.com`, or the wrong domain](references/troubleshooting.md#wrong-domain).

### 2. Add an endpoint-only Worker {#worker}

The handler answers on every path, so the Worker doesn't need routing:

mcp-worker.js

```javascript
import { createWebRequestHandler } from 'docusaurus-plugin-mcp-server/adapters';
import bundle from './build/mcp/bundle.json' with { type: 'json' };

export default {
  fetch: createWebRequestHandler({ artifacts: bundle }),
};
```

wrangler.jsonc

```json
{
  "name": "my-docs-mcp",
  "main": "mcp-worker.js",
  "compatibility_date": "2026-10-01"
}
```

**Check:** `mcp-worker.js` and `wrangler.jsonc` are next to `docusaurus.config.js`, and `wrangler.jsonc`'s `main` is `mcp-worker.js`.

**If the check fails:** see [Troubleshooting](references/troubleshooting.md).

### 3. Deploy both from one workflow {#workflow}

**Needs the user.**

**Confirm first.**

.github/workflows/deploy-docs.yml

```yaml
name: Deploy docs

on:
  push:
    branches: [main]

permissions:
  contents: read
  pages: write
  id-token: write

jobs:
  deploy:
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.pages.outputs.page_url }}
    steps:
      - uses: actions/checkout@v7
      - uses: actions/setup-node@v7
        with:
          node-version: 24
          cache: npm
      - run: npm ci
      - run: npm run build

      # The site → GitHub Pages
      - uses: actions/upload-pages-artifact@v5
        with:
          path: build
      - id: pages
        uses: actions/deploy-pages@v5

      # The endpoint → Cloudflare, from the same build
      - run: npx wrangler deploy
        env:
          CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          CLOUDFLARE_ACCOUNT_ID: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
```

Before the first run:

- In the repository settings, set **Pages → Source** to **GitHub Actions**.
- Create a Cloudflare API token with the **Edit Cloudflare Workers** template, and add it and your account ID as the `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` secrets.
- Add `wrangler` to your `devDependencies`.

The repository settings, the Cloudflare API token, and the secrets are the user's to set. Tell the user exactly which to add, and wait for them to confirm before pushing: the workflow deploys on every push to `main`.

**Check:** The workflow run on the Actions tab succeeds, with both the Pages deploy and `wrangler deploy` steps green.

**If the check fails:** see [The function build fails with "Cannot find module '…/build/mcp/bundle.json'"](references/troubleshooting.md#bundle-not-found) or [Cloudflare: "Script startup exceeded CPU time limit" or "script too large"](references/troubleshooting.md#cloudflare-limits).

### 4. Check it {#check}

```bash
curl https://my-docs-mcp.my-subdomain.workers.dev/mcp
```

The status JSON's `baseUrl` should be your GitHub Pages URL. Open the site and check that the install button shows the Worker URL.

**Check:** The status JSON has `"initialized": true` and `baseUrl` is the GitHub Pages URL.

**If the check fails:** see [The status check returns 500 with an `error` message](references/troubleshooting.md#status-500), [Results link to `localhost`, `example.com`, or the wrong domain](references/troubleshooting.md#wrong-domain), [The install button shows the wrong URL](references/troubleshooting.md#install-button-url) or [The endpoint serves old content](references/troubleshooting.md#old-content).

## Troubleshooting

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

Generated from https://docusaurus-plugin-mcp-server.vercel.app/docs/deploy/static-hosts. If a step doesn't match what the user sees, tell them, and point them to that page.
