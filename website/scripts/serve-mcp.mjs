// Serves the deployed MCP function (api/mcp.mjs) over local HTTP, on the built
// bundle, at http://localhost:$PORT/mcp (default 3458). The site tests
// (playwright.site.config.ts at the repo root) run against it, so they test the
// file Vercel deploys. Run after `npm run build`.
import http from 'node:http';
import handler from '../api/mcp.mjs';

const port = Number(process.env.PORT ?? 3458);
const MAX_BODY = 4 * 1024 * 1024;

const server = http.createServer(async (req, res) => {
  try {
    const chunks = [];
    let size = 0;
    for await (const chunk of req) {
      size += chunk.length;
      if (size > MAX_BODY) {
        res.writeHead(413).end();
        return;
      }
      chunks.push(chunk);
    }
    const headers = new Headers();
    for (const [name, value] of Object.entries(req.headers)) {
      if (value !== undefined) headers.set(name, Array.isArray(value) ? value.join(', ') : value);
    }
    const hasBody = req.method !== 'GET' && req.method !== 'HEAD' && chunks.length > 0;
    const response = await handler.fetch(
      new Request(new URL(req.url ?? '/', `http://localhost:${port}`), {
        method: req.method,
        headers,
        ...(hasBody ? { body: Buffer.concat(chunks) } : {}),
      })
    );
    res.writeHead(response.status, Object.fromEntries(response.headers));
    if (response.body) {
      for await (const chunk of response.body) res.write(chunk);
    }
    res.end();
  } catch (error) {
    console.error(error);
    if (!res.headersSent) res.writeHead(500);
    res.end();
  }
});

server.listen(port, () => {
  console.log(`MCP function (api/mcp.mjs) at http://localhost:${port}/mcp`);
});
