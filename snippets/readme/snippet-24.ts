import type { SearchRanker } from 'docusaurus-plugin-mcp-server';
import { createWebRequestHandler } from 'docusaurus-plugin-mcp-server/adapters';
import bundle from '../build/mcp/bundle.json';

const glean: SearchRanker = {
  name: 'glean',
  async search(query, options) {
    // Call the Glean Search API and map each hit to a SearchResult:
    // { url, route, title, score, snippet }
    return [];
  },
};

export default {
  fetch: createWebRequestHandler({ artifacts: bundle, search: glean }),
};
