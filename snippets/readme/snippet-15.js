// docusaurus.config.js: build time
module.exports = {
  plugins: [
    [
      'docusaurus-plugin-mcp-server',
      {
        // Run both the built-in local search indexer and a custom one
        indexers: ['local', './my-algolia-indexer.js'],
      },
    ],
  ],
};

// worker.js: runtime. The search provider is chosen where the server runs.
import GleanSearchProvider from '@myorg/glean-search';

createWebRequestHandler({ artifacts: bundle, search: new GleanSearchProvider() });
