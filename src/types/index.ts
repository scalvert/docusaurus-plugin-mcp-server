import type { SearchProvider } from '../providers/types.js';

/**
 * Field name in the search index. Higher weight = ranked higher when matched.
 */
export type FlexSearchField = 'title' | 'headings' | 'description' | 'content';

/**
 * Overrides for the built-in FlexSearch index configuration.
 *
 * The defaults are tuned for English content. Sites with long compound
 * words (e.g. German, Finnish) or large doc sets may want to relax
 * `tokenize`, drop `context`, or lower `resolution` to reduce
 * index size.
 *
 * The same config must be supplied at build time (via plugin options)
 * AND at runtime (via `McpServerBaseConfig.flexsearch`). Otherwise the
 * runtime provider deserializes the index with the wrong shape and
 * returns no results.
 */
export interface FlexSearchConfig {
  /** Tokenization mode. Default: 'forward'. Use 'strict' for whole-word-only. */
  tokenize?: 'strict' | 'forward' | 'reverse' | 'full';
  /** Ranking resolution 1-9. Default: 9. Lower = smaller index. */
  resolution?: number;
  /** Phrase/proximity context. Default: { resolution: 2, depth: 2, bidirectional: true }. Set to false to disable (much smaller index). */
  context?: false | { resolution?: number; depth?: number; bidirectional?: boolean };
  /** Query result cache. Default: 100. */
  cache?: number | boolean;
  /** Custom tokenizer. Default: lowercase split + English stemmer. */
  encode?: (str: string) => string[];
  /** Weights applied per field during ranking. Defaults: title 3, headings 2, description 1.5, content 1. */
  fieldWeights?: Partial<Record<FlexSearchField, number>>;
}

/**
 * Configuration options for the MCP server plugin
 */
export interface McpServerPluginOptions {
  /** Output directory for MCP artifacts (relative to build dir). Default: 'mcp' */
  outputDir?: string;
  /** CSS selectors for content extraction, in order of priority */
  contentSelectors?: string[];
  /** CSS selectors for elements to remove from content before processing */
  excludeSelectors?: string[];
  /** Minimum content length (in characters) to consider a page valid. Default: 50 */
  minContentLength?: number;
  /** Server configuration */
  server?: {
    /** Name of the MCP server */
    name?: string;
    /** Version of the MCP server */
    version?: string;
  };
  /** Routes to exclude from processing (glob patterns) */
  excludeRoutes?: string[];

  /**
   * Indexers to run during build.
   *
   * - undefined (default): runs 'flexsearch' for backward compatibility
   * - ['flexsearch']: same as default, produces docs.json + search-index.json
   * - ['./my-indexer.js']: runs only custom indexer(s)
   * - false: disables all indexing, no artifacts produced
   *
   * Each string can be:
   * - 'flexsearch' (built-in)
   * - './path/to/indexer.js' (relative path)
   * - '@myorg/custom-indexer' (npm package)
   */
  indexers?: string[] | false;

  /**
   * Search provider module. Default: 'flexsearch'
   *
   * Can be:
   * - 'flexsearch' (built-in, requires FlexSearch indexer to have run)
   * - './path/to/search.js' (relative path)
   * - '@myorg/glean-search' (npm package)
   */
  search?: string;

  /**
   * Overrides for the built-in FlexSearch indexer/provider. See {@link FlexSearchConfig}.
   * Ignored when a custom indexer/provider is used.
   */
  flexsearch?: FlexSearchConfig;
}

/**
 * Resolved plugin options with defaults applied
 */
export interface ResolvedPluginOptions {
  outputDir: string;
  contentSelectors: string[];
  excludeSelectors: string[];
  minContentLength: number;
  server: {
    name: string;
    version: string;
  };
  excludeRoutes: string[];
  /** Indexers to run. undefined means ['flexsearch'], false disables indexing */
  indexers: string[] | false | undefined;
  /** Search provider module */
  search: string;
  /** FlexSearch overrides for the built-in indexer/provider. */
  flexsearch?: FlexSearchConfig;
}

/**
 * A processed documentation page
 */
export interface ProcessedDoc {
  /** URL route path (e.g., /docs/getting-started) */
  route: string;
  /** Page title extracted from HTML */
  title: string;
  /** Meta description if available */
  description: string;
  /** Full page content as markdown */
  markdown: string;
  /** Headings with IDs for section navigation */
  headings: DocHeading[];
}

/**
 * A heading within a document
 */
export interface DocHeading {
  /** Heading level (1-6) */
  level: number;
  /** Heading text content */
  text: string;
  /** Anchor ID for linking */
  id: string;
  /** Character offset where this section starts in the markdown */
  startOffset: number;
  /** Character offset where this section ends in the markdown */
  endOffset: number;
}

/**
 * A flattened route from Docusaurus
 */
export interface FlattenedRoute {
  /** The URL path */
  path: string;
  /** Path to the corresponding HTML file */
  htmlPath: string;
}

/**
 * Search result from FlexSearch
 */
export interface SearchResult {
  /** Full URL of the matching document (use this with docs_fetch) */
  url: string;
  /** Route path of the matching document */
  route: string;
  /** Title of the document */
  title: string;
  /** Relevance score */
  score: number;
  /** Snippet of matching content */
  snippet: string;
  /** Matching headings if any */
  matchingHeadings?: string[];
}

/**
 * Manifest metadata for the MCP artifacts
 */
export interface McpManifest {
  /** Plugin version */
  version: string;
  /** Build timestamp */
  buildTime: string;
  /** Number of documents indexed */
  docCount: number;
  /** Server name */
  serverName: string;
  /** Base URL of the documentation site */
  baseUrl?: string;
  /** Names of indexers that ran during build */
  indexers?: string[];
}

/**
 * Per-tool configuration overrides
 */
export interface McpToolConfig {
  /** Override the default tool description shown to MCP clients */
  description?: string;
}

/**
 * Overrides for the built-in MCP tools, keyed by tool name
 */
export interface McpServerToolsConfig {
  /** Overrides for the docs_search tool */
  docs_search?: McpToolConfig;
  /** Overrides for the docs_fetch tool */
  docs_fetch?: McpToolConfig;
}

/**
 * Common MCP server configuration shared by all loading modes
 */
export interface McpServerBaseConfig {
  /** Server name */
  name: string;
  /** Server version */
  version?: string;
  /** Base URL for constructing full page URLs (e.g., https://docs.example.com) */
  baseUrl?: string;
  /**
   * Search provider. Default: 'flexsearch'.
   *
   * Accepts either a module specifier (string) loaded via dynamic `import()`,
   * or a {@link SearchProvider} instance. Pass an instance when running in a
   * bundled environment (Cloudflare Workers, etc.) where dynamic import of
   * arbitrary specifiers is not available.
   */
  search?: string | SearchProvider;
  /**
   * Overrides for the built-in FlexSearch provider. See {@link FlexSearchConfig}.
   * Must match the config used at index build time. Ignored when `search` is
   * a custom provider.
   */
  flexsearch?: FlexSearchConfig;
  /**
   * Instructions describing how to use the server and its tools.
   * Surfaced to MCP clients in the initialize response.
   */
  instructions?: string;
  /** Per-tool overrides, such as custom descriptions */
  tools?: McpServerToolsConfig;
}

/**
 * MCP Server configuration for file-based loading
 */
export interface McpServerFileConfig extends McpServerBaseConfig {
  /** Path to docs.json file */
  docsPath: string;
  /** Path to search-index.json file */
  indexPath: string;
}

/**
 * MCP Server configuration for pre-loaded data (e.g., Cloudflare Workers)
 */
export interface McpServerDataConfig extends McpServerBaseConfig {
  /** Pre-loaded docs data */
  docs: Record<string, ProcessedDoc>;
  /** Pre-loaded search index data (exported from FlexSearch via exportSearchIndex) */
  searchIndexData: Record<string, unknown>;
}

/**
 * MCP Server configuration - supports both file-based and pre-loaded data modes
 */
export type McpServerConfig = McpServerFileConfig | McpServerDataConfig;

/**
 * Internal representation of the docs index
 */
export interface DocsIndex {
  /** All processed documents keyed by route */
  docs: Record<string, ProcessedDoc>;
  /** Manifest metadata */
  manifest: McpManifest;
}

/**
 * Input parameters for docs_search tool
 */
export interface DocsSearchParams {
  /** Search query string */
  query: string;
  /** Maximum number of results (default: 16, max: 20) */
  limit?: number;
}

/**
 * Input parameters for docs_fetch tool
 */
export interface DocsFetchParams {
  /** Full URL of the page to fetch */
  url: string;
}

/**
 * Content extraction result from HTML
 */
export interface ExtractedContent {
  /** Page title */
  title: string;
  /** Meta description */
  description: string;
  /** Main content as HTML */
  contentHtml: string;
}

/**
 * Default plugin options
 */
export const DEFAULT_PLUGIN_OPTIONS: ResolvedPluginOptions = {
  outputDir: 'mcp',
  contentSelectors: ['article', 'main', '.main-wrapper', '[role="main"]'],
  excludeSelectors: [
    'nav',
    'header',
    'footer',
    'aside',
    '[role="navigation"]',
    '[role="banner"]',
    '[role="contentinfo"]',
  ],
  minContentLength: 50,
  server: {
    name: 'docs-mcp-server',
    version: '1.0.0',
  },
  excludeRoutes: ['/404*', '/search*'],
  indexers: undefined, // Default: ['flexsearch'] applied at runtime
  search: 'flexsearch',
};
