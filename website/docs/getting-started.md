---
title: Getting started
description: Add the plugin to a Docusaurus site, build the artifact bundle, and run the MCP server locally.
---

# Getting started

This page takes you from an existing Docusaurus 3 site to an MCP server running on your machine. Deploying it is covered in [Deploy](./deploy/index.md).

## 1. Install the plugin

```bash
npm install docusaurus-plugin-mcp-server
```

## 2. Add it to your config

```javascript snippet=readme/snippet-01.js
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

`server.name` is the name agents see for your server. Every option is optional; see [Plugin options](./reference/plugin-options.md).

:::warning[Set your site's `url`]

Every page URL the server returns is built from `url` in `docusaurus.config.js` **at build time**. If it still says `https://your-docusaurus-site.example.com`, agents get links to that. Set it to your production domain before you build for production.

:::

## 3. Build and verify

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

## 4. Run the server locally

The Node adapter serves the bundle straight from `build/mcp`. Save this next to `docusaurus.config.js`:

```javascript snippet=readme/snippet-16.js
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

## 5. Connect an agent

Point an MCP client at the local server. For Claude Code:

```bash
claude mcp add --transport http my-docs http://localhost:3456
```

Then ask it something your docs answer. [Connecting AI tools](./guides/connect-clients.md) covers Cursor, VS Code, and other clients, and [Testing the endpoint](./guides/testing.md) shows how to call the tools directly.

The local server reads the bundle once at startup. After you rebuild, restart it.

## Next steps

1. **Deploy the endpoint.** Pick your host in [Deploy](./deploy/index.md). Each guide is a complete setup: the function file, the routing config, and how to check it works.
2. **Add the install button** so readers can connect their own tools: [Install button](./guides/install-button.md).
3. **Tune it**: [search ranking](./guides/search.md), [Agent Skills](./guides/agent-skills.md), or [your own search provider](./guides/custom-providers.md).
