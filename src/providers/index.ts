export type {
  ProviderContext,
  ContentIndexer,
  SearchProvider,
  SearchProviderInitData,
  SearchOptions,
  ContentIndexerModule,
  SearchProviderModule,
} from './types.js';

export { loadIndexer, loadSearchProvider } from './loader.js';

export { FlexSearchIndexer } from './indexers/flexsearch-indexer.js';
export { FlexSearchProvider } from './search/flexsearch-provider.js';
