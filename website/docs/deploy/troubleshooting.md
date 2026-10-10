---
title: Troubleshooting deployments
description: Fixes for the errors you're most likely to hit when deploying the MCP endpoint.
sidebar_label: Troubleshooting
---

# Troubleshooting deployments

Start with the status check, `curl https://docs.example.com/mcp`. What it returns tells you which section below applies.

## `/mcp` returns 404, or your site's 404 page

The platform isn't routing `/mcp` to the function.

- **Vercel:** check the `rewrites` entry in `vercel.json`, and that the function is at `api/mcp.mjs` in the project's root directory. `/api/mcp` should answer even without the rewrite.
- **Netlify:** check `export const config = { path: '/mcp' }` in the function, and that the function is in `netlify/functions/`.
- **Cloudflare Workers:** check that `run_worker_first` includes `"/mcp"`.
- **Node:** check the handler is mounted with `app.all('/mcp', …)`.

## Docs pages return 404, but the homepage and `/mcp` work

With `trailingSlash: false`, Docusaurus writes `/docs/intro` as `docs/intro.html`, and the host has to map the URL to that file.

- **Vercel:** add `"cleanUrls": true` to `vercel.json`.
- **Express:** pass `{ extensions: ['html'] }` to `express.static`.
- **Deno:** retry with `.html`, as the [Deno example](./deno-and-bun.md#deno) does.

## The function build fails with "Cannot find module '…/build/mcp/bundle.json'"

The function was bundled before `docusaurus build` ran, or from a different directory.

- Make sure the platform's build command runs `docusaurus build` (usually `npm run build`).
- Check the relative path from the function file to `build/mcp/bundle.json`: `../build/…` from `api/`, `../../build/…` from `netlify/functions/`, `./build/…` from the site root.
- If you changed the plugin's `outputDir`, import from that directory instead of `build/mcp`.

## `ERR_IMPORT_ATTRIBUTE_MISSING`, or "needs an import attribute of type: json"

Node.js and Deno need an import attribute to import JSON. Write the import as:

```javascript
import bundle from '../build/mcp/bundle.json' with { type: 'json' };
```

## `SyntaxError: Cannot use import statement outside a module`

The function file is being run as CommonJS. Name it `.mjs`, or set `"type": "module"` in `package.json`.

<Symptom id="status-500" guide="setup-docusaurus-mcp">

## The status check returns 500 with an `error` message

The server started but couldn't load the bundle. The message says why and how to fix it. Common ones:

- **The bundle was built by a newer or older plugin version.** Rebuild with the plugin version the function runs, and redeploy both together.
- **The search index is missing.** The `local` indexer was turned off (`indexers: false`) but the server uses the built-in search. Turn the indexer back on or pass a [custom search provider](../guides/custom-providers.md).

Other failures return `Internal server error`, and the details go to the platform's function logs.

<Check>

The status check returns 200 with `"initialized": true`.

</Check>

</Symptom>

## Tool calls return 406 Not Acceptable

The request's `Accept` header must include both `application/json` and `text/event-stream`. MCP clients send it. Add `-H "Accept: application/json, text/event-stream"` to `curl` requests.

## Tool calls return 405 Method Not Allowed

MCP requests are `POST`. `GET` is the status check, and other methods get 405.

<Symptom id="wrong-domain" guide="setup-docusaurus-mcp">

## Results link to `localhost`, `example.com`, or the wrong domain

Page URLs come from `url` in `docusaurus.config.js` at build time. Fix `url`, rebuild, and redeploy. The `baseUrl` server option changes only what the status check reports.

<Check>

`docs_search` results link to pages on the production domain.

</Check>

</Symptom>

## The install button shows the wrong URL

The button advertises `{url}/{outputDir}`, which is `/mcp` by default. If the endpoint is somewhere else, set [`server.url`](../reference/plugin-options.md), or set `server.urlBase: 'site'` if the endpoint is under your `baseUrl`.

<Symptom id="old-content" guide="setup-docusaurus-mcp">

## The endpoint serves old content

The bundle is baked into the function at deploy time. Redeploy after rebuilding. With the Node adapter, restart the process. Clients may cache list and read results for up to 5 minutes.

</Symptom>

## A browser-based client is blocked by CORS

The handlers allow every origin by default. If you set `corsOrigin`, make sure it matches the client's origin exactly, including the scheme and port.

## Cloudflare: "Script startup exceeded CPU time limit" or "script too large"

The bundle is part of the Worker script. Check the size with `npx wrangler deploy --dry-run`. If it's over your plan's limit, exclude pages you don't need agents to see (`excludeRoutes`), move to the Paid plan, or deploy the endpoint on a [Node](./node.md) host instead.

## Still stuck

Run `npx docusaurus-mcp-verify` against your build. If the build verifies but the deployment fails, [open an issue](https://github.com/scalvert/docusaurus-plugin-mcp-server/issues) with the platform, the status check output, and the function logs.
