---
title: Getting started
description: Add the plugin to a Docusaurus site, build the artifact bundle, and run the MCP server locally.
---

# Getting started

This page takes you from an existing Docusaurus 3 site to an MCP server running on your machine. Deploying it is covered in [Deploy](./deploy/index.md).

<ForHumans>

:::tip[Let your AI agent do it]

This page is also an [agent guide](./guides/agent-guides.md). Install this project's skills with `npx skills add scalvert/docusaurus-plugin-mcp-server`, or connect your agent to this site's MCP endpoint (`https://docusaurus-plugin-mcp-server.vercel.app/mcp`), and ask it to set up the plugin. It follows these steps and checks each one.

:::

</ForHumans>

<AgentGuide
  name="setup-docusaurus-mcp"
  kind="setup"
  description="Add docusaurus-plugin-mcp-server to a Docusaurus 3 site, build its artifact bundle, and run the MCP server locally. Use when the user wants to set up, install, or try an MCP server for their Docusaurus docs.">

<DoneWhen>

`curl http://localhost:3456` returns the server status with `"initialized": true` and a `docCount` above 0.

</DoneWhen>

<Prerequisites>

- A Docusaurus 3 site. Check: `npm ls @docusaurus/core` shows a 3.x version.
- Node.js 22 or later. Check: `node --version`.

</Prerequisites>

<Step id="install">

## 1. Install the plugin

```bash
npm install docusaurus-plugin-mcp-server
```

<Check>

`npm ls docusaurus-plugin-mcp-server` lists the package.

</Check>

</Step>

<Step id="configure" symptoms="wrong-domain">

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

<ForAgents>

If `url` is still the Docusaurus default, ask the user for their production domain. Don't guess it.

</ForAgents>

<Check>

`docusaurus.config.js` lists `'docusaurus-plugin-mcp-server'` under `plugins`, and `url` is the site's production domain.

</Check>

</Step>

<Step id="build">

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

<Check>

`npx docusaurus-mcp-verify` ends with `✅ All checks passed!`

</Check>

</Step>

<Step id="run-locally" symptoms="status-500 old-content">

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

<Check>

`curl http://localhost:3456` returns JSON with `"initialized": true`.

</Check>

</Step>

<Step id="connect">

## 5. Connect an agent

Point an MCP client at the local server. For Claude Code:

```bash
claude mcp add --transport http my-docs http://localhost:3456
```

Then ask it something your docs answer. [Connecting AI tools](./guides/connect-clients.md) covers Cursor, VS Code, and other clients, and [Testing the endpoint](./guides/testing.md) shows how to call the tools directly.

The local server reads the bundle once at startup. After you rebuild, restart it.

<ForAgents>

If you can't run `claude mcp add` yourself, tell the user how to add the server in their client, using [Connecting AI tools](./guides/connect-clients.md).

</ForAgents>

<Check>

The client lists `my-docs` among its MCP servers, and asking it about the docs returns an answer that cites a docs page.

</Check>

</Step>

</AgentGuide>

## Next steps

1. **Deploy the endpoint.** Pick your host in [Deploy](./deploy/index.md). Each guide is a complete setup: the function file, the routing config, and how to check it works.
2. **Add the install button** so readers can connect their own tools: [Install button](./guides/install-button.md).
3. **Tune it**: [search ranking](./guides/search.md), [Agent Skills](./guides/agent-skills.md), or [your own search provider](./guides/custom-providers.md).
