import { loadSearchProvider, evaluateSearch } from 'docusaurus-plugin-mcp-server';

const provider = await loadSearchProvider('local');
await provider.initialize(
  { baseUrl: 'https://docs.example.com', serverName: 'eval', serverVersion: '0', outputDir: '' },
  { docsPath: 'build/mcp/docs.json', indexPath: 'build/mcp/search-index.json' }
);

const report = await evaluateSearch(provider, [
  { query: 'install the CLI', expected: ['/docs/installation'] },
  { query: 'rotate an API token', expected: ['/docs/auth/tokens', '/docs/auth/rotation'] },
]);

console.log(report.hitsAt[3], '/', report.total, 'in the top 3; MRR', report.mrr.toFixed(2));
