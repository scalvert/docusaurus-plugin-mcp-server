import type { LocalSearchConfig } from '../types/index.js';
import type { ContentIndexer, SearchProvider } from './types.js';

/**
 * Options forwarded to the built-in 'local' search provider.
 * Ignored for custom specifiers.
 */
export interface BuiltinSearchOptions {
  localSearch?: LocalSearchConfig;
}

// 1.x built-in name. Rejected with a pointer to the migration guide rather
// than silently remapped: the index format changed, so a 1.x index cannot be
// served, and a stale config should fail at build time, not return nothing.
const REMOVED_BUILTIN = 'flexsearch';

function removedBuiltinError(kind: 'indexer' | 'search provider'): Error {
  return new Error(
    `The '${REMOVED_BUILTIN}' ${kind} was replaced by the built-in 'local' search in docusaurus-plugin-mcp-server 2.0. ` +
      `Use 'local' (or omit the option), remove any 'flexsearch' options, and rebuild the site. ` +
      `See "Upgrading to 2.0" in the README.`
  );
}

/**
 * Load an indexer by name or module path.
 *
 * @param specifier - Either 'local' for the built-in indexer, or a module path
 *                    (relative path like './my-indexer.js' or npm package like '@myorg/indexer')
 * @returns Instantiated ContentIndexer
 *
 * @example
 * ```typescript
 * // Built-in local search indexer
 * const indexer = await loadIndexer('local');
 *
 * // Custom relative path
 * const indexer = await loadIndexer('./src/providers/algolia-indexer.js');
 * ```
 */
export async function loadIndexer(specifier: string): Promise<ContentIndexer> {
  if (specifier === 'local') {
    const { LocalSearchIndexer } = await import('./indexers/local-search-indexer.js');
    return new LocalSearchIndexer();
  }
  if (specifier === REMOVED_BUILTIN) {
    throw removedBuiltinError('indexer');
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
 * @param specifier - 'local' for the built-in provider, a module path to
 *                    dynamically import, or a {@link SearchProvider} instance.
 *                    Pass an instance when running in a bundled environment
 *                    where dynamic `import()` of arbitrary specifiers is not
 *                    available (e.g. Cloudflare Workers).
 * @param builtinOptions - Options passed to the built-in provider constructor (ignored otherwise)
 * @returns Instantiated SearchProvider
 *
 * @example
 * ```typescript
 * // Built-in local search, weighing titles more heavily
 * const provider = await loadSearchProvider('local', { localSearch: { fieldBoosts: { title: 5 } } });
 *
 * // Pre-instantiated (Workers / bundled environments)
 * const provider = await loadSearchProvider(new MyProvider());
 * ```
 */
export async function loadSearchProvider(
  specifier: string | SearchProvider,
  builtinOptions?: BuiltinSearchOptions
): Promise<SearchProvider> {
  if (typeof specifier !== 'string') {
    if (!isSearchProvider(specifier)) {
      throw new Error(
        'Invalid search provider instance: does not implement SearchProvider interface'
      );
    }
    return specifier;
  }

  if (specifier === 'local') {
    const { LocalSearchProvider } = await import('./search/local-search-provider.js');
    return new LocalSearchProvider(builtinOptions?.localSearch);
  }
  if (specifier === REMOVED_BUILTIN) {
    throw removedBuiltinError('search provider');
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
