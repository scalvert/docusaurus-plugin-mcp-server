---
title: Troubleshooting deployments
description: Fixes for the errors you're most likely to hit when deploying the MCP endpoint.
sidebar_label: Troubleshooting
---

# Troubleshooting deployments

Start with the status check, `curl https://docs.example.com/mcp`. What it returns tells you which section below applies.

{/* Each section is a Symptom, served to agents as part of every guide it names: Getting started (setup-docusaurus-mcp) and the deploy guides. */}

<Symptom id="mcp-404" guide="deploy-docusaurus-mcp-vercel deploy-docusaurus-mcp-netlify deploy-docusaurus-mcp-cloudflare">

## `/mcp` returns 404, or your site's 404 page

**Cause:** The platform isn't routing `/mcp` to the function.

**Fix:** Check the routing for your platform:

- **Vercel:** check the `rewrites` entry in `vercel.json`, and that the function is at `api/mcp.mjs` in the project's root directory. `/api/mcp` should answer even without the rewrite.
- **Netlify:** check `export const config = { path: '/mcp' }` in the function, and that the function is in `netlify/functions/`.
- **Cloudflare Workers:** check that `run_worker_first` includes `"/mcp"`.
- **Node:** check the handler is mounted with `app.all('/mcp', …)`.

<Check>

`curl https://docs.example.com/mcp` returns the status JSON.

</Check>

</Symptom>

<Symptom id="docs-404" guide="deploy-docusaurus-mcp-vercel">

## Docs pages return 404, but the homepage and `/mcp` work

**Cause:** With `trailingSlash: false`, Docusaurus writes `/docs/intro` as `docs/intro.html`, and the host has to map the URL to that file.

**Fix:**

- **Vercel:** add `"cleanUrls": true` to `vercel.json`.
- **Express:** pass `{ extensions: ['html'] }` to `express.static`.
- **Deno:** retry with `.html`, as the [Deno example](./deno-and-bun.md#deno) does.

<Check>

A docs page, such as `/docs/intro`, loads.

</Check>

</Symptom>

<Symptom id="bundle-not-found" guide="deploy-docusaurus-mcp-vercel deploy-docusaurus-mcp-netlify deploy-docusaurus-mcp-cloudflare deploy-docusaurus-mcp-static-host">

## The function build fails with "Cannot find module '…/build/mcp/bundle.json'"

**Cause:** The function was bundled before `docusaurus build` ran, or from a different directory.

**Fix:**

- Make sure the platform's build command runs `docusaurus build` (usually `npm run build`).
- Check the relative path from the function file to `build/mcp/bundle.json`: `../build/…` from `api/`, `../../build/…` from `netlify/functions/`, `./build/…` from the site root.
- If you changed the plugin's `outputDir`, import from that directory instead of `build/mcp`.

<Check>

The deploy finishes, and `build/mcp/bundle.json` exists after `npm run build`.

</Check>

</Symptom>

<Symptom id="import-attribute" guide="deploy-docusaurus-mcp-vercel deploy-docusaurus-mcp-netlify deploy-docusaurus-mcp-cloudflare deploy-docusaurus-mcp-static-host">

## `ERR_IMPORT_ATTRIBUTE_MISSING`, or "needs an import attribute of type: json"

**Cause:** Node.js and Deno need an import attribute to import JSON.

**Fix:** Write the import as:

```javascript
import bundle from '../build/mcp/bundle.json' with { type: 'json' };
```

</Symptom>

<Symptom id="esm-syntax" guide="setup-docusaurus-mcp deploy-docusaurus-mcp-vercel deploy-docusaurus-mcp-netlify deploy-docusaurus-mcp-cloudflare deploy-docusaurus-mcp-static-host">

## `SyntaxError: Cannot use import statement outside a module`

**Cause:** The function file is being run as CommonJS.

**Fix:** Name it `.mjs`, or set `"type": "module"` in `package.json`.

</Symptom>

<Symptom id="status-500" guide="setup-docusaurus-mcp deploy-docusaurus-mcp-vercel deploy-docusaurus-mcp-netlify deploy-docusaurus-mcp-cloudflare deploy-docusaurus-mcp-static-host">

## The status check returns 500 with an `error` message

**Cause:** The server started but couldn't load the bundle. The message says why and how to fix it.

**Fix:** Common ones:

- **The bundle was built by a newer or older plugin version.** Rebuild with the plugin version the function runs, and redeploy both together.
- **The search index is missing.** The `local` indexer was turned off (`indexers: false`) but the server uses the built-in search. Turn the indexer back on or pass a [custom search provider](../guides/custom-providers.md).

Other failures return `Internal server error`, and the details go to the platform's function logs.

<Check>

The status check returns 200 with `"initialized": true`.

</Check>

**Escalate if:** the message isn't one of these, or the error persists after a rebuild and redeploy. Run `npx docusaurus-mcp-verify` against the build and [open an issue](https://github.com/scalvert/docusaurus-plugin-mcp-server/issues) with its output and the status check's.

</Symptom>

<Symptom id="not-acceptable" guide="setup-docusaurus-mcp deploy-docusaurus-mcp-vercel deploy-docusaurus-mcp-netlify deploy-docusaurus-mcp-cloudflare deploy-docusaurus-mcp-static-host">

## Tool calls return 406 Not Acceptable

**Cause:** The request's `Accept` header must include both `application/json` and `text/event-stream`. MCP clients send it; a hand-written request may not.

**Fix:** Add `-H "Accept: application/json, text/event-stream"` to `curl` requests.

</Symptom>

<Symptom id="method-not-allowed" guide="setup-docusaurus-mcp deploy-docusaurus-mcp-vercel deploy-docusaurus-mcp-netlify deploy-docusaurus-mcp-cloudflare deploy-docusaurus-mcp-static-host">

## Tool calls return 405 Method Not Allowed

**Cause:** MCP requests are `POST`. `GET` is the status check, and other methods get 405.

**Fix:** Send tool calls as `POST`.

</Symptom>

<Symptom id="wrong-domain" guide="setup-docusaurus-mcp deploy-docusaurus-mcp-vercel deploy-docusaurus-mcp-netlify deploy-docusaurus-mcp-cloudflare deploy-docusaurus-mcp-static-host">

## Results link to `localhost`, `example.com`, or the wrong domain

**Cause:** Page URLs come from `url` in `docusaurus.config.js` at build time.

**Fix:** Fix `url`, rebuild, and redeploy. The `baseUrl` server option changes only what the status check reports.

<Check>

`docs_search` results link to pages on the production domain.

</Check>

</Symptom>

<Symptom id="install-button-url" guide="deploy-docusaurus-mcp-vercel deploy-docusaurus-mcp-netlify deploy-docusaurus-mcp-cloudflare deploy-docusaurus-mcp-static-host">

## The install button shows the wrong URL

**Cause:** The button advertises `{url}/{outputDir}`, which is `/mcp` by default.

**Fix:** If the endpoint is somewhere else, set [`server.url`](../reference/plugin-options.md), or set `server.urlBase: 'site'` if the endpoint is under your `baseUrl`.

<Check>

The install button shows the URL the status check answers at.

</Check>

</Symptom>

<Symptom id="old-content" guide="setup-docusaurus-mcp deploy-docusaurus-mcp-vercel deploy-docusaurus-mcp-netlify deploy-docusaurus-mcp-cloudflare deploy-docusaurus-mcp-static-host">

## The endpoint serves old content

**Cause:** The bundle is baked into the function at deploy time, and the Node adapter reads it once at startup.

**Fix:** Redeploy after rebuilding. With the Node adapter, restart the process. Clients may cache list and read results for up to 5 minutes.

<Check>

The status check's `docCount` matches what `docusaurus-mcp-verify` reports for the latest build.

</Check>

</Symptom>

<Symptom id="cors" guide="deploy-docusaurus-mcp-vercel deploy-docusaurus-mcp-netlify deploy-docusaurus-mcp-cloudflare deploy-docusaurus-mcp-static-host">

## A browser-based client is blocked by CORS

**Cause:** The handlers allow every origin by default, so a CORS error means `corsOrigin` is set and doesn't match.

**Fix:** Make sure `corsOrigin` matches the client's origin exactly, including the scheme and port.

</Symptom>

<Symptom id="cloudflare-limits" guide="deploy-docusaurus-mcp-cloudflare deploy-docusaurus-mcp-static-host">

## Cloudflare: "Script startup exceeded CPU time limit" or "script too large"

**Cause:** The bundle is part of the Worker script, and the script is over your plan's limit.

**Fix:** Check the size with `npx wrangler deploy --dry-run`. If it's over your plan's limit, exclude pages you don't need agents to see (`excludeRoutes`), move to the Paid plan, or deploy the endpoint on a [Node](./node.md) host instead.

<Check>

`npx wrangler deploy --dry-run` reports a size under your plan's limit.

</Check>

</Symptom>

## Still stuck

Run `npx docusaurus-mcp-verify` against your build. If the build verifies but the deployment fails, [open an issue](https://github.com/scalvert/docusaurus-plugin-mcp-server/issues) with the platform, the status check output, and the function logs.
