---
title: GitHub Pages and other static hosts
description: Keep your site on GitHub Pages, S3, or another static host, and run the MCP endpoint on a serverless platform from the same build.
sidebar_label: Static hosts
---

# GitHub Pages and other static hosts

GitHub Pages, S3, and other static hosts serve files but can't run code, so they can't answer MCP requests. Keep the site where it is and run the endpoint somewhere that runs functions. Two things make this work:

1. **Deploy both from one build**, so the endpoint serves the same docs as the site.
2. **Set `server.url`** to the endpoint's address, so the install button and plugin global data point there instead of `{url}/mcp`.

The example below uses GitHub Pages for the site and a Cloudflare Worker for the endpoint. Any platform in the [deploy guides](./index.md) works for the endpoint.

## 1. Point the plugin at the endpoint

```javascript title="docusaurus.config.js"
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

## 2. Add an endpoint-only Worker

The handler answers on every path, so the Worker doesn't need routing:

```javascript title="mcp-worker.js"
import { createWebRequestHandler } from 'docusaurus-plugin-mcp-server/adapters';
import bundle from './build/mcp/bundle.json' with { type: 'json' };

export default {
  fetch: createWebRequestHandler({ artifacts: bundle }),
};
```

```json title="wrangler.jsonc"
{
  "name": "my-docs-mcp",
  "main": "mcp-worker.js",
  "compatibility_date": "2026-10-01"
}
```

## 3. Deploy both from one workflow

```yaml title=".github/workflows/deploy-docs.yml"
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

## 4. Check it

```bash
curl https://my-docs-mcp.my-subdomain.workers.dev/mcp
```

The status JSON's `baseUrl` should be your GitHub Pages URL. Open the site and check that the install button shows the Worker URL.

## Other combinations

- **S3 + CloudFront, Azure Static Web Apps, Firebase Hosting:** same pattern. Upload `build/`, deploy the endpoint from the same build, and set `server.url`.
- **Endpoint on Vercel or Netlify:** use the function from the [Vercel](./vercel.md) or [Netlify](./netlify.md) guide in a separate project, deployed with the same build output.
- **Same domain:** if your CDN can route a path to another origin (CloudFront behaviors, Cloudflare in front of Pages), route `/mcp` to the endpoint and skip `server.url`.
