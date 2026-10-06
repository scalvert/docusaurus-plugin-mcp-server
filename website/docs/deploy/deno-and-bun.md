---
title: Deploy with Deno or Bun
description: Run the site and its MCP endpoint from one Deno or Bun server, for Deno Deploy, containers, or any host that runs a long-lived process.
sidebar_label: Deno and Bun
---

# Deploy with Deno or Bun

Deno and Bun both serve web-standard handlers natively, so the MCP handler plugs straight into their built-in servers. Each example below serves the static site and `/mcp` from one process.

## Deno

```javascript title="main.js"
import { serveDir } from 'jsr:@std/http/file-server';
import { createWebRequestHandler } from 'docusaurus-plugin-mcp-server/adapters';
import bundle from './build/mcp/bundle.json' with { type: 'json' };

const mcp = createWebRequestHandler({ artifacts: bundle });

Deno.serve(async (request) => {
  const url = new URL(request.url);
  if (url.pathname === '/mcp') {
    return mcp(request);
  }
  const response = await serveDir(request, { fsRoot: 'build', quiet: true });
  if (response.status !== 404 || url.pathname.endsWith('/')) {
    return response;
  }
  // With trailingSlash: false, Docusaurus writes /docs/intro as docs/intro.html.
  url.pathname += '.html';
  return serveDir(new Request(url, request), { fsRoot: 'build', quiet: true });
});
```

Deno resolves `docusaurus-plugin-mcp-server` from your `package.json` and `node_modules`. Run it locally:

```bash
npm run build
deno run --allow-net --allow-read --allow-env --allow-sys main.js
```

The server listens on `http://localhost:8000`, with the endpoint at `http://localhost:8000/mcp`.

**On [Deno Deploy](https://docs.deno.com/deploy/)**, create an app from your repository with:

- **Install command:** `npm ci`
- **Build command:** `npm run build`
- **Entrypoint:** `main.js`

The build has to run before the entrypoint is loaded, because `main.js` imports `build/mcp/bundle.json`.

## Bun

```javascript title="server.js"
import { createWebRequestHandler } from 'docusaurus-plugin-mcp-server/adapters';
import bundle from './build/mcp/bundle.json' with { type: 'json' };

const mcp = createWebRequestHandler({ artifacts: bundle });

// Serve build/ for every other path: /docs/intro → build/docs/intro.html or build/docs/intro/index.html
async function serveStatic(request) {
  const { pathname } = new URL(request.url);
  for (const candidate of [pathname, `${pathname}.html`, `${pathname}/index.html`]) {
    const file = Bun.file(`./build${candidate}`);
    if (await file.exists()) {
      return new Response(file);
    }
  }
  return new Response(Bun.file('./build/404.html'), { status: 404 });
}

Bun.serve({
  port: Number(process.env.PORT ?? 3000),
  routes: { '/mcp': mcp },
  fetch: serveStatic,
});
```

```bash
npm run build
bun server.js
```

The endpoint is at `http://localhost:3000/mcp`. To run it in production, start `bun server.js` on any host that runs a long-lived process (a VM, a container, Fly.io, Railway, Render). Run `npm run build` in the image build so `build/` ships with it.

## Check it

Use your server's public URL:

```bash
curl https://docs.example.com/mcp
```

You should get the [status JSON](./index.md#check-a-deployment).

## Notes

- **One import form for both.** `with { type: 'json' }` is required by Deno and accepted by Bun.
- **Only MCP?** If something else serves the static site, drop the static handling and serve `mcp` alone: `Deno.serve(mcp)` or `Bun.serve({ fetch: mcp })`. Then set [`server.url`](../reference/plugin-options.md) to wherever the endpoint ends up.

Something not working? See [Troubleshooting](./troubleshooting.md).
