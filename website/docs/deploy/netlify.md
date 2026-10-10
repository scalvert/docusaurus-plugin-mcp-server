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

<AgentGuide
  name="deploy-docusaurus-mcp-netlify"
  kind="setup"
  description="Deploy a Docusaurus site and its docusaurus-plugin-mcp-server endpoint to Netlify, with the MCP endpoint as a Netlify Function at /mcp. Use when the user wants to deploy, host, or publish their docs MCP server on Netlify.">

<DoneWhen>

`curl https://<your-domain>/mcp` returns the status JSON with `"initialized": true`, a `docCount` above 0, and `baseUrl` on your production domain.

</DoneWhen>

<Prerequisites>

- The plugin is set up: `npm run build` writes `build/mcp/bundle.json`. If not, follow [Getting started](../getting-started.md) first.
- A Netlify account, and either the Netlify CLI (`npx netlify`) or access to the Netlify dashboard.

</Prerequisites>

<Step id="function">

## 1. Add the function

```javascript title="netlify/functions/mcp.mjs"
import { createWebRequestHandler } from 'docusaurus-plugin-mcp-server/adapters';
import bundle from '../../build/mcp/bundle.json' with { type: 'json' };

const handler = createWebRequestHandler({ artifacts: bundle });

export default (request) => handler(request);

export const config = { path: '/mcp' };
```

`config.path` serves the function at `/mcp` instead of the default `/.netlify/functions/mcp`. The import goes up two directories, from `netlify/functions/` to the site root.

<Check>

`netlify/functions/mcp.mjs` exists, imports `../../build/mcp/bundle.json`, and exports `config` with `path: '/mcp'`.

</Check>

</Step>

<Step id="netlify-toml">

## 2. Add `netlify.toml`

```toml title="netlify.toml"
[build]
  command = "npm run build"
  publish = "build"

[functions]
  node_bundler = "esbuild"
```

Netlify runs `command` first and bundles functions afterward, so the bundle exists when the function is bundled. esbuild inlines the JSON into the function.

<Check>

`netlify.toml` is next to `docusaurus.config.js`, with `publish = "build"`.

</Check>

</Step>

<Step id="site-url" symptoms="wrong-domain">

## 3. Set your site URL

Set `url` in `docusaurus.config.js` to your Netlify domain (`https://my-docs.netlify.app`) or your custom domain.

<Check>

`url` in `docusaurus.config.js` is the production domain, not `localhost` or `example.com`.

</Check>

</Step>

<Step id="deploy" needs="user" confirm symptoms="bundle-not-found import-attribute esm-syntax">

## 4. Deploy

Connect the repository in the Netlify dashboard (**Add new project → Import an existing project**). Netlify reads `netlify.toml`, so the build settings fill themselves in.

Or deploy with the [Netlify CLI](https://docs.netlify.com/cli/get-started/):

```bash
npx netlify deploy --build          # draft deploy
npx netlify deploy --build --prod   # production deploy
```

<ForAgents>

Connecting the repository happens in the dashboard, and the first CLI deploy asks the user to log in and pick a project. Ask the user to do either, and wait for the deploy URL. `--prod` replaces the live site.

</ForAgents>

<Check>

The deploy prints a deploy URL, and the deploy shows as **Published** in the Netlify dashboard.

</Check>

</Step>

<Step id="check" symptoms="mcp-404 status-500 wrong-domain old-content">

## 5. Check it

```bash
curl https://my-docs.netlify.app/mcp
```

You should get the [status JSON](./index.md#check-a-deployment). Then connect a client:

```bash
claude mcp add --transport http my-docs https://my-docs.netlify.app/mcp
```

<Check>

`curl https://my-docs.netlify.app/mcp` (with your domain) returns JSON with `"initialized": true` and a `docCount` above 0.

</Check>

</Step>

</AgentGuide>

## Notes

- **Deploy previews** are built with your production `url`, so their tool results link to production. Netlify sets `DEPLOY_PRIME_URL` during builds. To make a preview link to itself, use it: `url: process.env.CONTEXT === 'production' ? 'https://docs.example.com' : process.env.DEPLOY_PRIME_URL`.
- **Release-only deploys.** To deploy only on tags, turn off automatic builds (**Project configuration → Build & deploy → Continuous deployment → Stop builds**) and run `netlify deploy --build --prod` from a tag-triggered CI job, with `NETLIFY_AUTH_TOKEN` and `NETLIFY_SITE_ID` set as secrets.
- **Monorepos.** Set **Base directory** to the site directory, and keep `netlify.toml` and `netlify/functions/` there.

Something not working? See [Troubleshooting](./troubleshooting.md).
