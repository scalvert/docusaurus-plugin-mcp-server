// docusaurus.config.js
module.exports = {
  plugins: [
    [
      'docusaurus-plugin-mcp-server',
      {
        // Run both the built-in local search indexer and a custom one
        indexers: ['local', './my-algolia-indexer.js'],
        // Use a custom search provider at runtime
        search: '@myorg/glean-search',
      },
    ],
  ],
};
