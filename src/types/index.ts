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
  /** Route of the matching document */
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
}

/**
 * MCP Server configuration for file-based loading
 */
export interface McpServerFileConfig {
  /** Path to docs.json file */
  docsPath: string;
  /** Path to search-index.json file */
  indexPath: string;
  /** Server name */
  name: string;
  /** Server version */
  version?: string;
  /** Base URL for constructing full page URLs (e.g., https://docs.example.com) */
  baseUrl?: string;
}

/**
 * MCP Server configuration for pre-loaded data (e.g., Cloudflare Workers)
 */
export interface McpServerDataConfig {
  /** Pre-loaded docs data */
  docs: Record<string, ProcessedDoc>;
  /** Pre-loaded search index data (exported from FlexSearch via exportSearchIndex) */
  searchIndexData: Record<string, unknown>;
  /** Server name */
  name: string;
  /** Server version */
  version?: string;
  /** Base URL for constructing full page URLs (e.g., https://docs.example.com) */
  baseUrl?: string;
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
  /** Maximum number of results (default: 5, max: 20) */
  limit?: number;
}

/**
 * Input parameters for docs_get_page tool
 */
export interface DocsGetPageParams {
  /** Route path of the page */
  route: string;
}

/**
 * Input parameters for docs_get_section tool
 */
export interface DocsGetSectionParams {
  /** Route path of the page */
  route: string;
  /** Heading ID of the section */
  headingId: string;
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
export const DEFAULT_OPTIONS: ResolvedPluginOptions = {
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
};
