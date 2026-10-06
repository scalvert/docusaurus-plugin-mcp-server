---
title: Custom providers
description: Push documents to an external system at build time, or delegate runtime search to a hosted service.
---

# Custom providers

The plugin uses a two-phase provider model. **Indexers** run at build time and process documents. **Search providers** answer queries at runtime. You can replace or add to both.

## ContentIndexer

Implement `ContentIndexer` to push documents to an external system during the build:

```typescript snippet=readme/snippet-13.ts
import type { ContentIndexer, ProviderContext, ProcessedDoc } from 'docusaurus-plugin-mcp-server';

export default class AlgoliaIndexer implements ContentIndexer {
  readonly name = 'algolia';

  shouldRun(): boolean {
    return process.env.ALGOLIA_SYNC === 'true';
  }

  async initialize(context: ProviderContext): Promise<void> {
    console.log(`[Algolia] Initializing for ${context.baseUrl}`);
  }

  async indexDocuments(docs: ProcessedDoc[]): Promise<void> {
    // Push docs to Algolia
  }

  async finalize(): Promise<Map<string, unknown>> {
    // No local artifacts needed
    return new Map();
  }
}
```

The plugin always writes the documents itself, whichever indexers run. What `finalize()` returns is added to the [artifact bundle](../reference/artifact-bundle.md):

- `search-index.json` becomes the bundle's search index. Only one indexer may return it.
- `bundle.json`, `manifest.json`, and `skills.json` are written by the plugin. Returning one fails the build.
- Any other filename (a relative path inside the output directory) is kept as an **indexer extra** and written to `build/mcp/`.
- `getManifestData()`, if implemented, is recorded in `manifest.json` under `indexerData.<name>`.

## SearchProvider

To delegate runtime search to an external service, pass a search provider as the server's `search` option. Since 2.2 it only needs a `name` and a `search` function (the `SearchRanker` type), so a plain object works:

```typescript snippet=readme/snippet-24.ts
import type { SearchRanker } from 'docusaurus-plugin-mcp-server';
import { createWebRequestHandler } from 'docusaurus-plugin-mcp-server/adapters';
import bundle from '../build/mcp/bundle.json' with { type: 'json' };

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
```

A class works the same way, and can add the optional members:

```typescript snippet=readme/snippet-14.ts
import type {
  SearchRanker,
  ProviderContext,
  SearchOptions,
  SearchResult,
} from 'docusaurus-plugin-mcp-server';

export default class GleanSearchProvider implements SearchRanker {
  readonly name = 'glean';

  private apiEndpoint = process.env.GLEAN_API_ENDPOINT;
  private apiToken = process.env.GLEAN_API_TOKEN;

  // Optional. Rejecting fails the server's initialization.
  async initialize(context: ProviderContext): Promise<void> {
    if (!this.apiEndpoint || !this.apiToken) {
      throw new Error('GLEAN_API_ENDPOINT and GLEAN_API_TOKEN required');
    }
  }

  async search(query: string, options?: SearchOptions): Promise<SearchResult[]> {
    // Call Glean Search API and transform results
    return [];
  }
}
```

### What a provider receives

With an `artifacts` or `artifactsDir` server config, `initialize` receives the artifact bundle as `initData.bundle`: the documents, the search index (if an indexer produced one), and any indexer extras. A provider can read what its indexer wrote without touching the filesystem.

`getDocument` and `getDocCount` are optional. Without them, `docs_fetch` and the status check use the bundle's documents.

This holds whether the server config passes an instance or a module path (`search: './my-search.js'`, whose default export is a `SearchRanker` class or object). Existing `SearchProvider` classes keep working unchanged. `loadSearchProvider()`, called directly with a module path, still requires a full `SearchProvider` in 2.x.

:::warning[Deprecated since 2.2]

`isReady()` and `healthCheck()`. Through 2.x the server still calls `isReady()`, and when it returns false the tools answer "Server not initialized". 3.0 stops calling it, so reject from `initialize()` or throw from `search()` instead. The server has never called `healthCheck()`. Use the `GET` status check (`McpDocsServer.getStatus()`). In 3.0, `SearchProvider` takes `SearchRanker`'s shape. See [Migrating from 2.x to 3.0.0](/migrations/2.x-3.0.0).

:::

## Configuring both

Indexers are chosen at build time in the plugin options. The search provider is chosen at runtime, where the server runs:

```javascript snippet=readme/snippet-15.js
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
```

Indexer paths are relative to the site directory. Search provider paths are relative to the server's working directory.
