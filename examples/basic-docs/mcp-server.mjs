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

import path from 'path';
import { fileURLToPath } from 'url';
import { createNodeServer } from 'docusaurus-plugin-mcp-server/adapters';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3456;

const server = createNodeServer({
  docsPath: path.join(__dirname, 'build/mcp/docs.json'),
  indexPath: path.join(__dirname, 'build/mcp/search-index.json'),
  name: 'example-docs',
  baseUrl: `http://localhost:${PORT}`,
});

server.listen(PORT, () => {
  console.log(`
MCP Server running at http://localhost:${PORT}

To connect Claude Code:
  claude mcp add --transport http example-docs http://localhost:${PORT}

To test with curl:
  curl http://localhost:${PORT}  # Health check
  curl -X POST http://localhost:${PORT} -H "Content-Type: application/json" -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
`);
});
