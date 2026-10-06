---
title: Deploy to Netlify
description: Serve a Docusaurus site on Netlify with the MCP endpoint as a Netlify Function at /mcp.
sidebar_label: Netlify
---

# Deploy to Netlify

Netlify publishes `build/` and runs the endpoint as a Netlify Function. The function declares its own path, so you don't need a redirect.

```text
my-docs/
├── netlify/
│   └── functions/
│       └── mcp.mjs      ← new: the MCP endpoint
├── docs/
├── docusaurus.config.js
├── netlify.toml         ← new: build settings
└── package.json
```

## 1. Add the function

```javascript title="netlify/functions/mcp.mjs"
import { createWebRequestHandler } from 'docusaurus-plugin-mcp-server/adapters';
import bundle from '../../build/mcp/bundle.json' with { type: 'json' };

const handler = createWebRequestHandler({ artifacts: bundle });

export default (request) => handler(request);

export const config = { path: '/mcp' };
```

`config.path` serves the function at `/mcp` instead of the default `/.netlify/functions/mcp`. The import goes up two directories, from `netlify/functions/` to the site root.

## 2. Add `netlify.toml`

```toml title="netlify.toml"
[build]
  command = "npm run build"
  publish = "build"

[functions]
  node_bundler = "esbuild"
```

Netlify runs `command` first and bundles functions afterward, so the bundle exists when the function is bundled. esbuild inlines the JSON into the function.

## 3. Set your site URL

Set `url` in `docusaurus.config.js` to your Netlify domain (`https://my-docs.netlify.app`) or your custom domain.

## 4. Deploy

Connect the repository in the Netlify dashboard (**Add new project → Import an existing project**). Netlify reads `netlify.toml`, so the build settings fill themselves in.

Or deploy with the [Netlify CLI](https://docs.netlify.com/cli/get-started/):

```bash
npx netlify deploy --build          # draft deploy
npx netlify deploy --build --prod   # production deploy
```

## 5. Check it

```bash
curl https://my-docs.netlify.app/mcp
```

You should get the [status JSON](./index.md#check-a-deployment). Then connect a client:

```bash
claude mcp add --transport http my-docs https://my-docs.netlify.app/mcp
```

## Notes

- **Deploy previews** are built with your production `url`, so their tool results link to production. Netlify sets `DEPLOY_PRIME_URL` during builds. To make a preview link to itself, use it: `url: process.env.CONTEXT === 'production' ? 'https://docs.example.com' : process.env.DEPLOY_PRIME_URL`.
- **Release-only deploys.** To deploy only on tags, turn off automatic builds (**Project configuration → Build & deploy → Continuous deployment → Stop builds**) and run `netlify deploy --build --prod` from a tag-triggered CI job, with `NETLIFY_AUTH_TOKEN` and `NETLIFY_SITE_ID` set as secrets.
- **Monorepos.** Set **Base directory** to the site directory, and keep `netlify.toml` and `netlify/functions/` there.

Something not working? See [Troubleshooting](./troubleshooting.md).
