// mcp-server.mjs
import { createNodeServer } from 'docusaurus-plugin-mcp-server/adapters/node';

createNodeServer({
  artifactsDir: './build/mcp',
  baseUrl: 'http://localhost:3000',
}).listen(3456, () => {
  console.log('MCP server at http://localhost:3456');
});
