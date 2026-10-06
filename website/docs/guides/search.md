---
title: Search
description: How the built-in BM25 search ranks pages, how to tune it, and how to measure ranking quality.
---

# Search

The built-in `local` search needs no external service. At build time it adds a search index to the artifact bundle, and at runtime `docs_search` answers from it.

## How pages are ranked

Results are ranked with [BM25+](https://en.wikipedia.org/wiki/Okapi_BM25) over each page's title, route, headings, description, and body:

- **Query words are combined with OR.** A page doesn't need every word in the query to match. Pages with more of the words, rarer words, or matches in more important fields rank higher.
- **The route is indexed.** `/docs/errors/expired-cursor` matches "expired cursor" even if the title says something else.
- **Long pages aren't favored.** Scores are normalized by field length, so a changelog that mentions every topic doesn't outrank the page about the topic.
- **Words are stemmed, accents are folded, and common words are ignored.** A Porter stemmer makes "indexing" match "index" and "route" match "routes". "deploiement" matches "déploiement", and "how do I" adds nothing to a query. Words of three or more letters also match as prefixes, so "auth" finds "authentication".

## Tune field boosts

Tokenization and stemming are fixed, so the index built at `docusaurus build` always matches the one queried at runtime. Field boosts apply at query time, so you can change them on the server config without a rebuild:

```javascript snippet=readme/snippet-21.js
createWebRequestHandler({
  artifacts: bundle,
  // Defaults: title 3, slug 3, headings 2, description 1.5, content 1
  localSearch: { fieldBoosts: { headings: 3 } },
});
```

The built-in search is tuned for English. For other languages, or to use a hosted search service, write a [custom search provider](./custom-providers.md#searchprovider).

## Measuring search quality

`evaluateSearch` runs labeled queries against any search provider and reports how often the right page comes back near the top. Use it to compare providers, or to guard ranking in CI after `docusaurus build`.

:::caution[Experimental]

`evaluateSearch`'s options and report shape may change in a 2.x minor release.

:::

```javascript snippet=readme/snippet-22.js
import { loadSearchProvider, evaluateSearch } from 'docusaurus-plugin-mcp-server';
import { readArtifactBundle } from 'docusaurus-plugin-mcp-server/adapters/node';

const provider = await loadSearchProvider('local');
await provider.initialize(
  { baseUrl: 'https://docs.example.com', serverName: 'eval', serverVersion: '0', outputDir: '' },
  { bundle: await readArtifactBundle('build/mcp') }
);

const report = await evaluateSearch(provider, [
  { query: 'install the CLI', expected: ['/docs/installation'] },
  { query: 'rotate an API token', expected: ['/docs/auth/tokens', '/docs/auth/rotation'] },
]);

console.log(report.hitsAt[3], '/', report.total, 'in the top 3; MRR', report.mrr.toFixed(2));
```

- `expected` lists every page that fully answers the query, as routes or full URLs.
- `hitsAt[k]` counts queries whose first correct page ranked at or above `k` (by default `k` is 1, 3, and 5).
- `mrr` is the mean reciprocal rank of that page. 1.0 means it was always first.
- `report.cases` has each query's rank and returned routes, for finding the misses.
