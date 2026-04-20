import { createVercelHandler } from 'docusaurus-plugin-mcp-server/adapters';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default createVercelHandler({
  docsPath: path.join(__dirname, '../build/mcp/docs.json'),
  indexPath: path.join(__dirname, '../build/mcp/search-index.json'),
  name: 'my-docs',
  baseUrl: 'https://docs.example.com',
});
