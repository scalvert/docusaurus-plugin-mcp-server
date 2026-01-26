import type { ProcessedDoc, SearchResult } from '../types/index.js';

/**
 * Context passed to providers during initialization
 */
export interface ProviderContext {
  /** Site base URL (e.g., https://docs.example.com) */
  baseUrl: string;
  /** MCP server name */
  serverName: string;
  /** MCP server version */
  serverVersion: string;
  /** Output directory for artifacts */
  outputDir: string;
}

/**
 * Build-time provider that indexes extracted documents.
 *
 * Consumers implement this to push docs to external systems (Glean, Algolia, etc.)
 * or to transform the extraction output for their own pipelines.
 *
 * @example
 * ```typescript
 * import type { ContentIndexer, ProviderContext } from 'docusaurus-plugin-mcp-server';
 * import type { ProcessedDoc } from 'docusaurus-plugin-mcp-server';
 *
 * export default class AlgoliaIndexer implements ContentIndexer {
 *   readonly name = 'algolia';
 *
 *   shouldRun(): boolean {
 *     // Only run when ALGOLIA_SYNC=true is set
 *     return process.env.ALGOLIA_SYNC === 'true';
 *   }
 *
 *   async initialize(context: ProviderContext): Promise<void> {
 *     console.log(`[Algolia] Initializing for ${context.baseUrl}`);
 *   }
 *
 *   async indexDocuments(docs: ProcessedDoc[]): Promise<void> {
 *     // Push docs to Algolia
 *   }
 *
 *   async finalize(): Promise<Map<string, unknown>> {
 *     // No local artifacts needed
 *     return new Map();
 *   }
 * }
 * ```
 */
export interface ContentIndexer {
  /** Unique name for this indexer */
  readonly name: string;

  /**
   * Check if this indexer should run.
   * Use this to gate execution on environment variables.
   * Default: true if not implemented.
   *
   * @example
   * shouldRun() {
   *   if (process.env.GLEAN_SYNC !== 'true') {
   *     console.log('[Glean] Skipping sync (set GLEAN_SYNC=true to enable)');
   *     return false;
   *   }
   *   return true;
   * }
   */
  shouldRun?(): boolean;

  /**
   * Initialize the indexer with context about the build.
   * Called once before indexDocuments.
   */
  initialize(context: ProviderContext): Promise<void>;

  /**
   * Index the extracted documents.
   * Called once with all processed documents.
   */
  indexDocuments(docs: ProcessedDoc[]): Promise<void>;

  /**
   * Return artifacts to write to outputDir.
   * Map of filename -> JSON-serializable content.
   * Return empty map to skip local artifact generation.
   */
  finalize(): Promise<Map<string, unknown>>;

  /**
   * Optional metadata to include in manifest.json
   */
  getManifestData?(): Promise<Record<string, unknown>>;
}

/**
 * Data passed to search provider during initialization.
 * Supports both file-based and pre-loaded data modes.
 */
export interface SearchProviderInitData {
  /** Path to docs.json (file mode) */
  docsPath?: string;
  /** Path to search-index.json (file mode) */
  indexPath?: string;
  /** Pre-loaded docs (data mode) */
  docs?: Record<string, ProcessedDoc>;
  /** Pre-loaded index data (data mode) */
  indexData?: Record<string, unknown>;
}

/**
 * Options for search queries
 */
export interface SearchOptions {
  /** Maximum number of results to return */
  limit?: number;
}

/**
 * Runtime provider that handles search queries from MCP tools.
 *
 * Consumers implement this to delegate search to external systems (Glean, Algolia, etc.).
 *
 * @example
 * ```typescript
 * import type { SearchProvider, ProviderContext, SearchOptions } from 'docusaurus-plugin-mcp-server';
 * import type { SearchResult, ProcessedDoc } from 'docusaurus-plugin-mcp-server';
 *
 * export default class GleanSearchProvider implements SearchProvider {
 *   readonly name = 'glean';
 *
 *   private apiEndpoint = process.env.GLEAN_API_ENDPOINT!;
 *   private apiToken = process.env.GLEAN_API_TOKEN!;
 *
 *   async initialize(context: ProviderContext): Promise<void> {
 *     if (!this.apiEndpoint || !this.apiToken) {
 *       throw new Error('GLEAN_API_ENDPOINT and GLEAN_API_TOKEN required');
 *     }
 *   }
 *
 *   isReady(): boolean {
 *     return !!this.apiEndpoint && !!this.apiToken;
 *   }
 *
 *   async search(query: string, options?: SearchOptions): Promise<SearchResult[]> {
 *     // Call Glean Search API and transform results
 *     return [];
 *   }
 * }
 * ```
 */
export interface SearchProvider {
  /** Unique name for this provider */
  readonly name: string;

  /**
   * Initialize the search provider.
   * Called once before any search queries.
   */
  initialize(context: ProviderContext, initData?: SearchProviderInitData): Promise<void>;

  /**
   * Check if the provider is ready to handle search queries.
   */
  isReady(): boolean;

  /**
   * Search for documents matching the query.
   */
  search(query: string, options?: SearchOptions): Promise<SearchResult[]>;

  /**
   * Get a document by its route.
   * Used by docs_get_page and docs_get_section tools.
   */
  getDocument?(route: string): Promise<ProcessedDoc | null>;

  /**
   * Check if the provider is healthy.
   * Used for health checks and debugging.
   */
  healthCheck?(): Promise<{ healthy: boolean; message?: string }>;
}

/**
 * Type for module that exports a ContentIndexer
 */
export type ContentIndexerModule = {
  default: new () => ContentIndexer;
};

/**
 * Type for module that exports a SearchProvider
 */
export type SearchProviderModule = {
  default: new () => SearchProvider;
};
