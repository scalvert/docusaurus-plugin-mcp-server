/**
 * Local MCP server for development and testing
 *
 * Run after building the Docusaurus site:
 *   npm run build
 *   npm run mcp:serve
 *
 * Then connect Claude Code:
 *   claude mcp add --transport http example-docs http://localhost:3456
 */

import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import { McpDocsServer } from 'docusaurus-plugin-mcp-server';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3456;

const server = new McpDocsServer({
  docsPath: path.join(__dirname, 'build/mcp/docs.json'),
  indexPath: path.join(__dirname, 'build/mcp/search-index.json'),
  name: 'example-docs',
  baseUrl: `http://localhost:${PORT}`,
});

const httpServer = http.createServer(async (req, res) => {
  // Add CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Handle preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // Health check
  if (req.method === 'GET') {
    const status = await server.getStatus();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(status, null, 2));
    return;
  }

  // MCP requests
  if (req.method === 'POST') {
    try {
      let body = '';
      for await (const chunk of req) {
        body += chunk;
      }
      const parsedBody = JSON.parse(body);
      await server.handleHttpRequest(req, res, parsedBody);
    } catch (error) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          jsonrpc: '2.0',
          id: null,
          error: { code: -32603, message: error.message },
        })
      );
    }
    return;
  }

  res.writeHead(405, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Method not allowed' }));
});

httpServer.listen(PORT, () => {
  console.log(`
MCP Server running at http://localhost:${PORT}

To connect Claude Code:
  claude mcp add --transport http example-docs http://localhost:${PORT}

To test with curl:
  curl http://localhost:${PORT}  # Health check
  curl -X POST http://localhost:${PORT} -H "Content-Type: application/json" -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
`);
});
