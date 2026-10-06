---
title: Deploy with Node.js and Express
description: Serve the MCP endpoint from Express or Node's http module, on a VM, a container, or behind a reverse proxy.
sidebar_label: Node.js and Express
---

# Deploy with Node.js and Express

The Node adapter (`docusaurus-plugin-mcp-server/adapters/node`) reads the bundle from `build/mcp` at startup, so nothing needs bundling. Use it when you run a long-lived Node process: a VM, a container, or a platform like Render or Fly.io.

## Express

```javascript title="server.mjs"
import express from 'express';
import { createNodeHandler } from 'docusaurus-plugin-mcp-server/adapters/node';

const app = express();

// Mount for every method: GET is the status check, OPTIONS the CORS preflight, POST is MCP.
app.all('/mcp', createNodeHandler({ artifactsDir: './build/mcp' }));

// The static site. `extensions` maps /docs/intro to docs/intro.html (trailingSlash: false builds).
app.use(express.static('build', { extensions: ['html'] }));

const port = Number(process.env.PORT ?? 3000);
app.listen(port, () => {
  console.log(`Docs at http://localhost:${port}, MCP at http://localhost:${port}/mcp`);
});
```

```bash
npm install express
npm run build
node server.mjs
```

- Mount the handler with `app.all`, not `app.post`. `GET` is the status check and `OPTIONS` is the CORS preflight.
- You don't need a body parser. The handler reads the body itself, with a 1 MB limit. If `express.json()` has already run, the handler uses `req.body`.
- The handler reads `build/mcp` on the first request and keeps it in memory. **Restart the process after each rebuild.**
- `express.static` doesn't try `.html` for a path whose last segment contains a dot (such as `/migrations/2.x-3.0.0`). Use `trailingSlash: true` in `docusaurus.config.js` if your slugs have dots.

## Node's `http` module

To serve only the endpoint and nothing else, use `createNodeServer`. It answers on every path:

```javascript title="mcp-server.mjs"
import { createNodeServer } from 'docusaurus-plugin-mcp-server/adapters/node';

createNodeServer({ artifactsDir: './build/mcp' }).listen(Number(process.env.PORT ?? 3456));
```

`createNodeHandler` returns a Node `(req, res)` handler, so it also works with `http.createServer`, Connect, or any framework that accepts one.

## Behind a reverse proxy

If nginx or another proxy already serves `build/`, proxy only `/mcp` to the Node process:

```nginx title="nginx.conf"
location = /mcp {
  proxy_pass http://127.0.0.1:3456;
  proxy_http_version 1.1;
  proxy_set_header Host $host;
  proxy_buffering off;
}
```

## In a container

```dockerfile title="Dockerfile"
FROM node:24-slim
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build
ENV PORT=3000
EXPOSE 3000
CMD ["node", "server.mjs"]
```

Building inside the image ties each image to one build of the docs, so redeploying the image redeploys the docs and the endpoint together.

## Check it

```bash
curl https://docs.example.com/mcp
```

You should get the [status JSON](./index.md#check-a-deployment). The Node server pretty-prints it.

Something not working? See [Troubleshooting](./troubleshooting.md).
