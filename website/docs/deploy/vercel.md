---
title: Deploy to Vercel
description: Serve a Docusaurus site and its MCP endpoint from one Vercel project, with an optional CI workflow that deploys only on release tags.
sidebar_label: Vercel
---

# Deploy to Vercel

Vercel serves the static site and runs `api/mcp.mjs` as a Vercel Function. A rewrite maps `/mcp` to it. This site is deployed this way.

You'll add two files:

```text
my-docs/
├── api/
│   └── mcp.mjs          ← new: the MCP endpoint
├── docs/
├── docusaurus.config.js
├── package.json
└── vercel.json          ← new: build settings and the /mcp rewrite
```

## 1. Add the function

Create `api/mcp.mjs` in your site's root, next to `docusaurus.config.js`:

```javascript title="api/mcp.mjs"
import { createWebRequestHandler } from 'docusaurus-plugin-mcp-server/adapters';
import bundle from '../build/mcp/bundle.json' with { type: 'json' };

export default {
  fetch: createWebRequestHandler({ artifacts: bundle }),
};
```

Vercel's Node.js runtime runs a default export with a `fetch` method as a web-standard handler. Vercel builds the function after your build command, so `build/mcp/bundle.json` exists when the function is bundled, and its file tracing includes the bundle in the function.

## 2. Add `vercel.json`

```json title="vercel.json"
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

## 3. Set your site URL

In `docusaurus.config.js`, set `url` to the domain you'll serve from, for example `https://my-docs.vercel.app` or your custom domain. Page URLs in tool results are built from it.

## 4. Deploy

With the [Vercel CLI](https://vercel.com/docs/cli):

```bash
npx vercel          # preview deployment; links the project on first run
npx vercel --prod   # production deployment
```

Or import the repository in the Vercel dashboard. Then every push to the production branch deploys to production, and every other branch gets a preview. If the site is in a subdirectory of the repo, set **Root Directory** to that directory in the project settings.

## 5. Check it

```bash
curl https://my-docs.vercel.app/mcp
```

You should get the [status JSON](./index.md#check-a-deployment) with your document count. Then connect a client:

```bash
claude mcp add --transport http my-docs https://my-docs.vercel.app/mcp
```

## Deploy only when you release

Vercel deploys every push by default. To deploy on release tags only, as this site does, turn off Git deployments and deploy from GitHub Actions.

**1. Turn off Git deployments** in `vercel.json`:

```json title="vercel.json"
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "framework": "docusaurus-2",
  "buildCommand": "npm run build",
  "outputDirectory": "build",
  "cleanUrls": true,
  "git": { "deploymentEnabled": false },
  "rewrites": [{ "source": "/mcp", "destination": "/api/mcp" }]
}
```

**2. Link the project and collect its IDs.** Run `npx vercel link` in the site directory. It writes `.vercel/project.json`, which holds `orgId` and `projectId`. Don't commit `.vercel/`.

**3. Add three repository secrets** in GitHub, under **Settings → Secrets and variables → Actions**:

| Secret | Value |
| --- | --- |
| `VERCEL_TOKEN` | A token from [vercel.com/account/tokens](https://vercel.com/account/tokens), scoped to the team that owns the project |
| `VERCEL_ORG_ID` | `orgId` from `.vercel/project.json` |
| `VERCEL_PROJECT_ID` | `projectId` from `.vercel/project.json` |

**4. Add the workflow:**

```yaml title=".github/workflows/deploy-docs.yml"
name: Deploy docs

on:
  push:
    tags: ['v*']
  workflow_dispatch:

concurrency:
  group: deploy-docs
  cancel-in-progress: false

jobs:
  deploy:
    runs-on: ubuntu-latest
    env:
      VERCEL_ORG_ID: ${{ secrets.VERCEL_ORG_ID }}
      VERCEL_PROJECT_ID: ${{ secrets.VERCEL_PROJECT_ID }}
    steps:
      - uses: actions/checkout@v7
      - uses: actions/setup-node@v7
        with:
          node-version: 24
          cache: npm
      - run: npm ci
      - run: npm install --global vercel@latest
      - run: vercel pull --yes --environment=production --token=${{ secrets.VERCEL_TOKEN }}
      - run: vercel build --prod --token=${{ secrets.VERCEL_TOKEN }}
      - run: vercel deploy --prebuilt --prod --token=${{ secrets.VERCEL_TOKEN }}
```

`vercel pull` fetches the project settings, `vercel build` runs your build command and bundles the function on the runner, and `vercel deploy --prebuilt` uploads the result. Because the build runs on GitHub Actions, Vercel runs no build and uses no build minutes.

Only `VERCEL_TOKEN` is a credential. The org and project IDs are identifiers, so you can put them in the workflow's `env` directly instead of storing them as secrets. Pushing a tag such as `v1.4.0` deploys that commit, and **Run workflow** on the Actions tab redeploys the latest commit on demand.

This site's own [deploy workflow](https://github.com/scalvert/docusaurus-plugin-mcp-server/blob/main/.github/workflows/deploy-website.yml) adds two checks around the deploy: it calls `api/mcp.mjs` against the fresh build before uploading, and `curl`s the production endpoint afterward.

## Notes

- **Runtime.** The function runs on the Node.js runtime with Fluid compute, Vercel's default. You don't need the Edge runtime.
- **Cost.** Each request is a short, CPU-light call against a bundle already in memory, and the site itself is static. For most docs sites the endpoint costs little or nothing beyond the plan's included usage.
- **Preview deployments** build with the same `url`, so their tool results link to production pages. To make a preview link to itself, set `url` from Vercel's system environment variables:

  ```javascript title="docusaurus.config.js"
  url:
    process.env.VERCEL_ENV === 'preview'
      ? `https://${process.env.VERCEL_BRANCH_URL}`
      : 'https://docs.example.com',
  ```

- **Monorepos.** When the site is in a subdirectory, run the CLI from that directory, or set **Root Directory** in the project settings. Keep `vercel.json` and `api/` in the site directory.

Something not working? See [Troubleshooting](./troubleshooting.md).
