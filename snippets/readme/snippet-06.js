import { createWebRequestHandler } from 'docusaurus-plugin-mcp-server/adapters';
import docs from '../build/mcp/docs.json';
import searchIndex from '../build/mcp/search-index.json';
import skills from '../build/mcp/skills.json';

export default {
  fetch: createWebRequestHandler({
    docs,
    searchIndexData: searchIndex,
    skills,
    name: 'my-docs',
    baseUrl: 'https://docs.example.com',
  }),
};
