import type { ContentIndexer, SearchProvider } from './types.js';
import { FlexSearchIndexer } from './indexers/flexsearch-indexer.js';
import { FlexSearchProvider } from './search/flexsearch-provider.js';

/**
 * Load an indexer by name or module path.
 *
 * @param specifier - Either 'flexsearch' for the built-in indexer, or a module path
 *                    (relative path like './my-indexer.js' or npm package like '@myorg/indexer')
 * @returns Instantiated ContentIndexer
 *
 * @example
 * ```typescript
 * // Built-in
 * const indexer = await loadIndexer('flexsearch');
 *
 * // Custom relative path
 * const indexer = await loadIndexer('./src/providers/algolia-indexer.js');
 *
 * // Custom npm package
 * const indexer = await loadIndexer('@myorg/custom-indexer');
 * ```
 */
export async function loadIndexer(specifier: string): Promise<ContentIndexer> {
  // Built-in FlexSearch indexer
  if (specifier === 'flexsearch') {
    return new FlexSearchIndexer();
  }

  // Dynamic import for external modules
  try {
    const module = await import(specifier);
    const IndexerClass = module.default;

    if (typeof IndexerClass === 'function') {
      // It's a class constructor
      const instance = new IndexerClass();

      // Validate it implements ContentIndexer
      if (!isContentIndexer(instance)) {
        throw new Error(
          `Invalid indexer module "${specifier}": does not implement ContentIndexer interface`
        );
      }

      return instance;
    }

    // Check if it's already an instance
    if (isContentIndexer(IndexerClass)) {
      return IndexerClass;
    }

    throw new Error(
      `Invalid indexer module "${specifier}": must export a default class or ContentIndexer instance`
    );
  } catch (error) {
    if (error instanceof Error && error.message.includes('Cannot find module')) {
      throw new Error(`Indexer module not found: "${specifier}". Check the path or package name.`);
    }
    throw error;
  }
}

/**
 * Load a search provider by name or module path.
 *
 * @param specifier - Either 'flexsearch' for the built-in provider, or a module path
 *                    (relative path like './my-search.js' or npm package like '@myorg/search')
 * @returns Instantiated SearchProvider
 *
 * @example
 * ```typescript
 * // Built-in
 * const provider = await loadSearchProvider('flexsearch');
 *
 * // Custom relative path
 * const provider = await loadSearchProvider('./src/providers/glean-search.js');
 *
 * // Custom npm package
 * const provider = await loadSearchProvider('@myorg/glean-search');
 * ```
 */
export async function loadSearchProvider(specifier: string): Promise<SearchProvider> {
  // Built-in FlexSearch provider
  if (specifier === 'flexsearch') {
    return new FlexSearchProvider();
  }

  // Dynamic import for external modules
  try {
    const module = await import(specifier);
    const ProviderClass = module.default;

    if (typeof ProviderClass === 'function') {
      // It's a class constructor
      const instance = new ProviderClass();

      // Validate it implements SearchProvider
      if (!isSearchProvider(instance)) {
        throw new Error(
          `Invalid search provider module "${specifier}": does not implement SearchProvider interface`
        );
      }

      return instance;
    }

    // Check if it's already an instance
    if (isSearchProvider(ProviderClass)) {
      return ProviderClass;
    }

    throw new Error(
      `Invalid search provider module "${specifier}": must export a default class or SearchProvider instance`
    );
  } catch (error) {
    if (error instanceof Error && error.message.includes('Cannot find module')) {
      throw new Error(
        `Search provider module not found: "${specifier}". Check the path or package name.`
      );
    }
    throw error;
  }
}

/**
 * Type guard to check if an object implements ContentIndexer
 */
function isContentIndexer(obj: unknown): obj is ContentIndexer {
  if (!obj || typeof obj !== 'object') {
    return false;
  }

  const indexer = obj as ContentIndexer;
  return (
    typeof indexer.name === 'string' &&
    typeof indexer.initialize === 'function' &&
    typeof indexer.indexDocuments === 'function' &&
    typeof indexer.finalize === 'function'
  );
}

/**
 * Type guard to check if an object implements SearchProvider
 */
function isSearchProvider(obj: unknown): obj is SearchProvider {
  if (!obj || typeof obj !== 'object') {
    return false;
  }

  const provider = obj as SearchProvider;
  return (
    typeof provider.name === 'string' &&
    typeof provider.initialize === 'function' &&
    typeof provider.isReady === 'function' &&
    typeof provider.search === 'function'
  );
}
