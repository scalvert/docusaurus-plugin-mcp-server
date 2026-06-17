import type { FlexSearchConfig } from '../types/index.js';
import type { ContentIndexer, SearchProvider } from './types.js';

/**
 * Options forwarded to the built-in 'flexsearch' indexer/provider.
 * Ignored for custom specifiers.
 */
export interface BuiltinIndexerOptions {
  flexsearch?: FlexSearchConfig;
}

/**
 * Load an indexer by name or module path.
 *
 * @param specifier - Either 'flexsearch' for the built-in indexer, or a module path
 *                    (relative path like './my-indexer.js' or npm package like '@myorg/indexer')
 * @param builtinOptions - Options passed to the built-in indexer constructor (ignored for custom specifiers)
 * @returns Instantiated ContentIndexer
 *
 * @example
 * ```typescript
 * // Built-in with overrides
 * const indexer = await loadIndexer('flexsearch', { flexsearch: { tokenize: 'strict' } });
 *
 * // Custom relative path
 * const indexer = await loadIndexer('./src/providers/algolia-indexer.js');
 * ```
 */
export async function loadIndexer(
  specifier: string,
  builtinOptions?: BuiltinIndexerOptions
): Promise<ContentIndexer> {
  if (specifier === 'flexsearch') {
    const { FlexSearchIndexer } = await import('./indexers/flexsearch-indexer.js');
    return new FlexSearchIndexer(builtinOptions?.flexsearch);
  }

  try {
    const module = await import(specifier);
    const IndexerClass = module.default;

    if (typeof IndexerClass === 'function') {
      // It's a class constructor
      const instance = new IndexerClass();

      if (!isContentIndexer(instance)) {
        throw new Error(
          `Invalid indexer module "${specifier}": does not implement ContentIndexer interface`
        );
      }

      return instance;
    }

    if (isContentIndexer(IndexerClass)) {
      return IndexerClass;
    }

    throw new Error(
      `Invalid indexer module "${specifier}": must export a default class or ContentIndexer instance`
    );
  } catch (error) {
    if (error instanceof Error && error.message.includes('Cannot find module')) {
      throw new Error(`Indexer module not found: "${specifier}". Check the path or package name.`, {
        cause: error,
      });
    }
    throw error;
  }
}

/**
 * Load a search provider by name, module path, or instance.
 *
 * @param specifier - 'flexsearch' for the built-in provider, a module path to
 *                    dynamically import, or a {@link SearchProvider} instance.
 *                    Pass an instance when running in a bundled environment
 *                    where dynamic `import()` of arbitrary specifiers is not
 *                    available (e.g. Cloudflare Workers).
 * @param builtinOptions - Options passed to the built-in provider constructor (ignored otherwise)
 * @returns Instantiated SearchProvider
 *
 * @example
 * ```typescript
 * // Built-in with overrides
 * const provider = await loadSearchProvider('flexsearch', { flexsearch: { tokenize: 'strict' } });
 *
 * // Pre-instantiated (Workers / bundled environments)
 * const provider = await loadSearchProvider(new MyProvider());
 * ```
 */
export async function loadSearchProvider(
  specifier: string | SearchProvider,
  builtinOptions?: BuiltinIndexerOptions
): Promise<SearchProvider> {
  if (typeof specifier !== 'string') {
    if (!isSearchProvider(specifier)) {
      throw new Error(
        'Invalid search provider instance: does not implement SearchProvider interface'
      );
    }
    return specifier;
  }

  if (specifier === 'flexsearch') {
    const { FlexSearchProvider } = await import('./search/flexsearch-provider.js');
    return new FlexSearchProvider(builtinOptions?.flexsearch);
  }

  try {
    const module = await import(specifier);
    const ProviderClass = module.default;

    if (typeof ProviderClass === 'function') {
      const instance = new ProviderClass();

      if (!isSearchProvider(instance)) {
        throw new Error(
          `Invalid search provider module "${specifier}": does not implement SearchProvider interface`
        );
      }

      return instance;
    }

    if (isSearchProvider(ProviderClass)) {
      return ProviderClass;
    }

    throw new Error(
      `Invalid search provider module "${specifier}": must export a default class or SearchProvider instance`
    );
  } catch (error) {
    if (error instanceof Error && error.message.includes('Cannot find module')) {
      throw new Error(
        `Search provider module not found: "${specifier}". Check the path or package name.`,
        { cause: error }
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
