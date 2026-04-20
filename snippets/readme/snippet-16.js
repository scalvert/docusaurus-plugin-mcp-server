// mcp-server.mjs
import { createNodeServer } from 'docusaurus-plugin-mcp-server/adapters';

createNodeServer({
  docsPath: './build/mcp/docs.json',
  indexPath: './build/mcp/search-index.json',
  name: 'my-docs',
  baseUrl: 'http://localhost:3000',
}).listen(3456, () => {
  console.log('MCP server at http://localhost:3456');
});
