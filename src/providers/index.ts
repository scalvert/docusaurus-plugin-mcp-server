// Provider types
export type {
  ProviderContext,
  ContentIndexer,
  SearchProvider,
  SearchProviderInitData,
  SearchOptions,
  ContentIndexerModule,
  SearchProviderModule,
} from './types.js';

// Provider loader
export { loadIndexer, loadSearchProvider } from './loader.js';

// Built-in providers
export { FlexSearchIndexer } from './indexers/flexsearch-indexer.js';
export { FlexSearchProvider } from './search/flexsearch-provider.js';
