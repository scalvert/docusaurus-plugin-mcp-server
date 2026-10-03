import { MIGRATION_GUIDE } from '../errors.js';
import type { LocalSearchConfig } from '../types/index.js';
import type { ContentIndexer, SearchProvider, SearchRanker } from './types.js';

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

export function removedBuiltinError(kind: 'indexer' | 'search provider'): Error {
  return new Error(
    `[MCP] The '${REMOVED_BUILTIN}' ${kind} was replaced by the built-in 'local' search in docusaurus-plugin-mcp-server 2.0. ` +
      `Use 'local' (or omit the option), remove any 'flexsearch' options, and rebuild the site. ` +
      `See ${MIGRATION_GUIDE}.`
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
export async function loadIndexer(
  specifier: string,
  options: {
    /**
     * Directory a relative path (`./my-indexer.js`) resolves against. The
     * plugin passes the site directory. Default: the working directory.
     */
    baseDir?: string;
  } = {}
): Promise<ContentIndexer> {
  if (specifier === 'local') {
    const { LocalSearchIndexer } = await import('./indexers/local-search-indexer.js');
    return new LocalSearchIndexer();
  }
  if (specifier === REMOVED_BUILTIN) {
    throw removedBuiltinError('indexer');
  }

  try {
    const module = await importModule(specifier, options.baseDir);
    const IndexerClass = module.default;

    if (typeof IndexerClass === 'function') {
      // It's a class constructor
      const instance: unknown = new (IndexerClass as new () => unknown)();

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

/** `SearchProvider` for a SearchProvider or `any` (as in 2.1), else the ranker's own type. */
export type LoadedProvider<P> = 0 extends 1 & P
  ? SearchProvider
  : P extends SearchProvider
    ? SearchProvider
    : P;

/**
 * Load a search provider by name, module path, or instance.
 *
 * @param specifier - 'local' for the built-in provider, a module path to
 *                    dynamically import, or an instance. Pass an instance when
 *                    running in a bundled environment where dynamic `import()`
 *                    of arbitrary specifiers is not available (e.g. Cloudflare
 *                    Workers). Since 2.2 an instance only needs to be a
 *                    {@link SearchRanker} (`name` and `search`), and is
 *                    returned as its own type. A module's default export must
 *                    still implement {@link SearchProvider}.
 * @param builtinOptions - Options passed to the built-in provider constructor (ignored otherwise)
 * @returns Instantiated SearchProvider, or the instance passed
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
// The generic overload comes first: `ReturnType`/`Parameters` read the last
// overload, which keeps the 2.1 signature. A SearchProvider instance (or an
// `any`) resolves to `SearchProvider`, exactly as in 2.1; any other ranker
// keeps its own type.
export function loadSearchProvider<P extends SearchRanker>(
  specifier: P,
  builtinOptions?: BuiltinSearchOptions
): Promise<LoadedProvider<P>>;
export function loadSearchProvider(
  specifier: string | SearchProvider,
  builtinOptions?: BuiltinSearchOptions
): Promise<SearchProvider>;
export async function loadSearchProvider(
  specifier: string | SearchRanker,
  builtinOptions?: BuiltinSearchOptions
): Promise<SearchRanker> {
  // A name or module path gets the full 2.1 SearchProvider check, so the
  // `SearchProvider` this promises for them is real.
  return loadSearch(specifier, builtinOptions, isSearchProvider);
}

/**
 * What McpDocsServer uses: like `loadSearchProvider`, but a module path's
 * default export only needs to be a SearchRanker (`name` and `search`), as an
 * instance does. Internal: not exported from the package.
 */
export async function loadSearchRanker(
  specifier: string | SearchRanker,
  builtinOptions?: BuiltinSearchOptions
): Promise<SearchRanker> {
  return loadSearch(specifier, builtinOptions, isSearchRanker);
}

async function loadSearch(
  specifier: string | SearchRanker,
  builtinOptions: BuiltinSearchOptions | undefined,
  isValidModuleExport: (obj: unknown) => obj is SearchRanker
): Promise<SearchRanker> {
  if (typeof specifier !== 'string') {
    if (!isSearchRanker(specifier)) {
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
    const module = await importModule(specifier);
    const ProviderClass = module.default;

    if (typeof ProviderClass === 'function') {
      const instance: unknown = new (ProviderClass as new () => unknown)();

      if (!isValidModuleExport(instance)) {
        throw new Error(
          `Invalid search provider module "${specifier}": does not implement SearchProvider interface`
        );
      }

      return instance;
    }

    if (isValidModuleExport(ProviderClass)) {
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

/** A relative or absolute file path, rather than a package name or URL. */
function isPath(specifier: string): boolean {
  return (
    /^\.{1,2}[\\/]/.test(specifier) ||
    specifier.startsWith('/') ||
    /^[A-Za-z]:[\\/]/.test(specifier)
  );
}

/**
 * Import a module. A relative path (`./x.js`, `../x.js`) resolves against
 * `baseDir` (default: the working directory), not against this package; any
 * path is imported as a file URL, which Windows needs for absolute paths.
 * Package names are imported as they are.
 */
async function importModule(specifier: string, baseDir?: string): Promise<{ default?: unknown }> {
  if (!isPath(specifier)) {
    return import(specifier);
  }
  // Dynamic, so the edge entry (which bundles this file) has no Node imports.
  const [{ pathToFileURL }, path] = await Promise.all([import('node:url'), import('node:path')]);
  return import(pathToFileURL(path.resolve(baseDir ?? process.cwd(), specifier)).href);
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
 * Type guard for the instance path: what McpDocsServer needs, a string
 * `name` and a `search` function.
 */
function isSearchRanker(obj: unknown): obj is SearchRanker {
  if (!obj || typeof obj !== 'object') {
    return false;
  }

  const ranker = obj as SearchRanker;
  return typeof ranker.name === 'string' && typeof ranker.search === 'function';
}

/**
 * Type guard to check if an object implements SearchProvider. Module
 * specifiers keep the 2.1 check.
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
