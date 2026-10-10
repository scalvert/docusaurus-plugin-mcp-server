---
name: setup-docusaurus-mcp
description: Add docusaurus-plugin-mcp-server to a Docusaurus 3 site, build its artifact bundle, and run the MCP server locally. Use when the user wants to set up, install, or try an MCP server for their Docusaurus docs.
metadata:
  agent-guide: setup
  agent-guide-format: "1"
  source: https://docusaurus-plugin-mcp-server.vercel.app/docs/getting-started
---

# Getting started

## Done when

`curl http://localhost:3456` returns the server status with `"initialized": true` and a `docCount` above 0.

## Before you start

- A Docusaurus 3 site. Check: `npm ls @docusaurus/core` shows a 3.x version.
- Node.js 22 or later. Check: `node --version`.

## How to use this guide

- Do the steps in order. Run them yourself, or walk the user through them one at a time if they'd rather do it themselves or you can't run them.
- After each step, run its check. Don't move on until it passes.
- If a check fails, look for the matching symptom under Troubleshooting. If none matches, stop and tell the user what you saw.
- A step marked **Needs the user** needs a person. Tell the user what to do and wait for them to confirm it's done.
- Ask the user before running a step marked **Confirm first**.
- Don't ask the user to paste passwords, tokens, or keys into the chat. When a step needs one, tell the user where to put it.

## Steps

### 1. Install the plugin {#install}

```bash
npm install docusaurus-plugin-mcp-server
```

**Check:** `npm ls docusaurus-plugin-mcp-server` lists the package.

**If the check fails:** see [Troubleshooting](references/troubleshooting.md).

### 2. Add it to your config {#configure}

```javascript
// docusaurus.config.js
module.exports = {
  plugins: [
    [
      'docusaurus-plugin-mcp-server',
      {
        server: {
          name: 'my-docs',
          version: '1.0.0',
        },
      },
    ],
  ],
};
```

`server.name` is the name agents see for your server. Every option is optional; see [Plugin options](https://docusaurus-plugin-mcp-server.vercel.app/docs/reference/plugin-options).

Set your site's `url`

Every page URL the server returns is built from `url` in `docusaurus.config.js` **at build time**. If it still says `https://your-docusaurus-site.example.com`, agents get links to that. Set it to your production domain before you build for production.

If `url` is still the Docusaurus default, ask the user for their production domain. Don't guess it.

**Check:** `docusaurus.config.js` lists `'docusaurus-plugin-mcp-server'` under `plugins`, and `url` is the site's production domain.

**If the check fails:** see [Results link to `localhost`, `example.com`, or the wrong domain](references/troubleshooting.md#wrong-domain).

### 3. Build and verify {#build}

```bash
npm run build
npx docusaurus-mcp-verify
```

The build writes the artifact bundle to `build/mcp/bundle.json`. `docusaurus-mcp-verify` checks that the bundle is valid and that a server can start from it:

```text
📁 Checking build output...
   ✓ Found 42 documents
   ✓ Artifact bundle is valid

🚀 Testing MCP server...
   ✓ Server "my-docs" initialized with 42 documents

✅ All checks passed!
```

To run the check on every build, add it as a `postbuild` script:

```json
{
  "scripts": {
    "build": "docusaurus build",
    "postbuild": "docusaurus-mcp-verify"
  }
}
```

**Check:** `npx docusaurus-mcp-verify` ends with `✅ All checks passed!`

**If the check fails:** see [Troubleshooting](references/troubleshooting.md).

### 4. Run the server locally {#run-locally}

The Node adapter serves the bundle straight from `build/mcp`. Save this next to `docusaurus.config.js`:

```javascript
// mcp-server.mjs
import { createNodeServer } from 'docusaurus-plugin-mcp-server/adapters/node';

createNodeServer({
  artifactsDir: './build/mcp',
  baseUrl: 'http://localhost:3000',
}).listen(3456, () => {
  console.log('MCP server at http://localhost:3456');
});
```

```bash
node mcp-server.mjs
```

Check it's up. A `GET` returns the server status:

```bash
curl http://localhost:3456
```

```json
{
  "name": "my-docs",
  "version": "1.0.0",
  "initialized": true,
  "docCount": 42,
  "skillCount": 1,
  "baseUrl": "http://localhost:3000",
  "searchProvider": "local"
}
```

**Check:** `curl http://localhost:3456` returns JSON with `"initialized": true`.

**If the check fails:** see [The status check returns 500 with an `error` message](references/troubleshooting.md#status-500) or [The endpoint serves old content](references/troubleshooting.md#old-content).

### 5. Connect an agent {#connect}

Point an MCP client at the local server. For Claude Code:

```bash
claude mcp add --transport http my-docs http://localhost:3456
```

Then ask it something your docs answer. [Connecting AI tools](https://docusaurus-plugin-mcp-server.vercel.app/docs/guides/connect-clients) covers Cursor, VS Code, and other clients, and [Testing the endpoint](https://docusaurus-plugin-mcp-server.vercel.app/docs/guides/testing) shows how to call the tools directly.

The local server reads the bundle once at startup. After you rebuild, restart it.

If you can't run `claude mcp add` yourself, tell the user how to add the server in their client, using [Connecting AI tools](https://docusaurus-plugin-mcp-server.vercel.app/docs/guides/connect-clients).

**Check:** The client lists `my-docs` among its MCP servers, and asking it about the docs returns an answer that cites a docs page.

**If the check fails:** see [Troubleshooting](references/troubleshooting.md).

## Troubleshooting

- [`SyntaxError: Cannot use import statement outside a module`](references/troubleshooting.md#esm-syntax)
- [The status check returns 500 with an `error` message](references/troubleshooting.md#status-500)
- [Tool calls return 406 Not Acceptable](references/troubleshooting.md#not-acceptable)
- [Tool calls return 405 Method Not Allowed](references/troubleshooting.md#method-not-allowed)
- [Results link to `localhost`, `example.com`, or the wrong domain](references/troubleshooting.md#wrong-domain)
- [The endpoint serves old content](references/troubleshooting.md#old-content)

## Source

Generated from https://docusaurus-plugin-mcp-server.vercel.app/docs/getting-started. If a step doesn't match what the user sees, tell them, and point them to that page.
