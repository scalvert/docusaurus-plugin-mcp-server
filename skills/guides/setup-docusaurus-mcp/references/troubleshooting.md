# Troubleshooting: Getting started

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

## The endpoint serves old content {#old-content}

**Cause:** The bundle is baked into the function at deploy time, and the Node adapter reads it once at startup.

**Fix:** Redeploy after rebuilding. With the Node adapter, restart the process. Clients may cache list and read results for up to 5 minutes.

**Check:** The status check's `docCount` matches what `docusaurus-mcp-verify` reports for the latest build.

Source: https://docusaurus-plugin-mcp-server.vercel.app/docs/deploy/troubleshooting#the-endpoint-serves-old-content
