import { createCloudflareHandler } from 'docusaurus-plugin-mcp-server/adapters';
import docs from '../build/mcp/docs.json';
import searchIndex from '../build/mcp/search-index.json';

export default {
  fetch: createCloudflareHandler({
    docs,
    searchIndexData: searchIndex,
    name: 'my-docs',
    baseUrl: 'https://docs.example.com',
  }),
};
