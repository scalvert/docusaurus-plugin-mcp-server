# Troubleshooting: Deploy to Netlify

## `/mcp` returns 404, or your site's 404 page {#mcp-404}

**Cause:** The platform isn't routing `/mcp` to the function.

**Fix:** Check the routing for your platform:

- **Vercel:** check the `rewrites` entry in `vercel.json`, and that the function is at `api/mcp.mjs` in the project's root directory. `/api/mcp` should answer even without the rewrite.

- **Netlify:** check `export const config = { path: '/mcp' }` in the function, and that the function is in `netlify/functions/`.

- **Cloudflare Workers:** check that `run_worker_first` includes `"/mcp"`.

- **Node:** check the handler is mounted with `app.all('/mcp', …)`.

**Check:** `curl https://docs.example.com/mcp` returns the status JSON.

Source: https://docusaurus-plugin-mcp-server.vercel.app/docs/deploy/troubleshooting#mcp-returns-404-or-your-sites-404-page

## The function build fails with "Cannot find module '…/build/mcp/bundle.json'" {#bundle-not-found}

**Cause:** The function was bundled before `docusaurus build` ran, or from a different directory.

**Fix:**

- Make sure the platform's build command runs `docusaurus build` (usually `npm run build`).

- Check the relative path from the function file to `build/mcp/bundle.json`: `../build/…` from `api/`, `../../build/…` from `netlify/functions/`, `./build/…` from the site root.

- If you changed the plugin's `outputDir`, import from that directory instead of `build/mcp`.

**Check:** The deploy finishes, and `build/mcp/bundle.json` exists after `npm run build`.

Source: https://docusaurus-plugin-mcp-server.vercel.app/docs/deploy/troubleshooting#the-function-build-fails-with-cannot-find-module-buildmcpbundlejson

## `ERR_IMPORT_ATTRIBUTE_MISSING`, or "needs an import attribute of type: json" {#import-attribute}

**Cause:** Node.js and Deno need an import attribute to import JSON.

**Fix:** Write the import as:

```javascript
import bundle from '../build/mcp/bundle.json' with { type: 'json' };
```

Source: https://docusaurus-plugin-mcp-server.vercel.app/docs/deploy/troubleshooting#err_import_attribute_missing-or-needs-an-import-attribute-of-type-json

## `SyntaxError: Cannot use import statement outside a module` {#esm-syntax}

**Cause:** The function file is being run as CommonJS.

**Fix:** Name it `.mjs`, or set `"type": "module"` in `package.json`.

Source: https://docusaurus-plugin-mcp-server.vercel.app/docs/deploy/troubleshooting#syntaxerror-cannot-use-import-statement-outside-a-module

## The status check returns 500 with an `error` message {#status-500}

**Cause:** The server started but couldn't load the bundle. The message says why and how to fix it.

**Fix:** Common ones:

- **The bundle was built by a newer or older plugin version.** Rebuild with the plugin version the function runs, and redeploy both together.

- **The search index is missing.** The `local` indexer was turned off (`indexers: false`) but the server uses the built-in search. Turn the indexer back on or pass a [custom search provider](https://docusaurus-plugin-mcp-server.vercel.app/docs/guides/custom-providers).

Other failures return `Internal server error`, and the details go to the platform's function logs.

**Check:** The status check returns 200 with `"initialized": true`.

**Escalate if:** the message isn't one of these, or the error persists after a rebuild and redeploy. Run `npx docusaurus-mcp-verify` against the build and [open an issue](https://github.com/scalvert/docusaurus-plugin-mcp-server/issues) with its output and the status check's.

Source: https://docusaurus-plugin-mcp-server.vercel.app/docs/deploy/troubleshooting#the-status-check-returns-500-with-an-error-message

## Tool calls return 406 Not Acceptable {#not-acceptable}

**Cause:** The request's `Accept` header must include both `application/json` and `text/event-stream`. MCP clients send it; a hand-written request may not.

**Fix:** Add `-H "Accept: application/json, text/event-stream"` to `curl` requests.

Source: https://docusaurus-plugin-mcp-server.vercel.app/docs/deploy/troubleshooting#tool-calls-return-406-not-acceptable

## Tool calls return 405 Method Not Allowed {#method-not-allowed}

**Cause:** MCP requests are `POST`. `GET` is the status check, and other methods get 405.

**Fix:** Send tool calls as `POST`.

Source: https://docusaurus-plugin-mcp-server.vercel.app/docs/deploy/troubleshooting#tool-calls-return-405-method-not-allowed

## Results link to `localhost`, `example.com`, or the wrong domain {#wrong-domain}

**Cause:** Page URLs come from `url` in `docusaurus.config.js` at build time.

**Fix:** Fix `url`, rebuild, and redeploy. The `baseUrl` server option changes only what the status check reports.

**Check:** `docs_search` results link to pages on the production domain.

Source: https://docusaurus-plugin-mcp-server.vercel.app/docs/deploy/troubleshooting#results-link-to-localhost-examplecom-or-the-wrong-domain

## The install button shows the wrong URL {#install-button-url}

**Cause:** The button advertises `{url}/{outputDir}`, which is `/mcp` by default.

**Fix:** If the endpoint is somewhere else, set [`server.url`](https://docusaurus-plugin-mcp-server.vercel.app/docs/reference/plugin-options), or set `server.urlBase: 'site'` if the endpoint is under your `baseUrl`.

**Check:** The install button shows the URL the status check answers at.

Source: https://docusaurus-plugin-mcp-server.vercel.app/docs/deploy/troubleshooting#the-install-button-shows-the-wrong-url

## The endpoint serves old content {#old-content}

**Cause:** The bundle is baked into the function at deploy time, and the Node adapter reads it once at startup.

**Fix:** Redeploy after rebuilding. With the Node adapter, restart the process. Clients may cache list and read results for up to 5 minutes.

**Check:** The status check's `docCount` matches what `docusaurus-mcp-verify` reports for the latest build.

Source: https://docusaurus-plugin-mcp-server.vercel.app/docs/deploy/troubleshooting#the-endpoint-serves-old-content

## A browser-based client is blocked by CORS {#cors}

**Cause:** The handlers allow every origin by default, so a CORS error means `corsOrigin` is set and doesn't match.

**Fix:** Make sure `corsOrigin` matches the client's origin exactly, including the scheme and port.

Source: https://docusaurus-plugin-mcp-server.vercel.app/docs/deploy/troubleshooting#a-browser-based-client-is-blocked-by-cors
