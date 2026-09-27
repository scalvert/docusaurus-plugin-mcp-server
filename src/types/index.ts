import type { SearchProvider } from '../providers/types.js';

/** Page fields the built-in local search indexes. `slug` is the route path as words. */
export type LocalSearchField = 'title' | 'slug' | 'headings' | 'description' | 'content';

/**
 * Runtime ranking options for the built-in local search.
 *
 * Boosts apply at query time, so they can be set on the server config without
 * rebuilding the index.
 */
export interface LocalSearchConfig {
  /**
   * Per-field boosts. Higher values weigh matches in that field more.
   * Defaults: title 3, slug 3, headings 2, description 1.5, content 1.
   */
  fieldBoosts?: Partial<Record<LocalSearchField, number>>;
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
    /**
     * Explicit MCP HTTP endpoint URL for the install button.
     * When set, `urlBase` and auto-derived paths are ignored.
     */
    url?: string;
    /**
     * How to derive the MCP URL from site config when `url` is not set.
     * - `'origin'` (default): `{siteUrl}/{outputDir}` — MCP at the site origin.
     * - `'site'`: under the Docusaurus `baseUrl`, e.g. `{siteUrl}{baseUrl}{outputDir}`.
     */
    urlBase?: 'origin' | 'site';
  };
  /** Routes to exclude from processing (glob patterns) */
  excludeRoutes?: string[];

  /**
   * Indexers to run during build.
   *
   * - undefined (default): runs the built-in 'local' indexer
   * - ['local']: same as default, produces docs.json + search-index.json
   * - ['./my-indexer.js']: runs only custom indexer(s)
   * - false: disables all indexing, no artifacts produced
   *
   * Each string can be:
   * - 'local' (built-in local search)
   * - './path/to/indexer.js' (relative path)
   * - '@myorg/custom-indexer' (npm package)
   */
  indexers?: string[] | false;

  /**
   * Search provider module. Default: 'local'
   *
   * Can be:
   * - 'local' (built-in, requires the 'local' indexer to have run)
   * - './path/to/search.js' (relative path)
   * - '@myorg/glean-search' (npm package)
   */
  search?: string;

  /**
   * Agent Skills served over MCP (the `io.modelcontextprotocol/skills`
   * extension). At build time the plugin writes `skills.json` alongside the
   * other artifacts; the runtime serves it via `skills/list`, `skills/get`
   * and `skill://` resources.
   *
   * - undefined (default): the built-in `docs-research` skill only
   * - `{ dir: 'mcp-skills' }`: also package every `<dir>/<name>/SKILL.md`
   *   skill directory (path relative to the site directory)
   * - `{ builtin: false, dir: ... }`: only your own skills
   * - `false`: no skills, no `skills.json`
   */
  skills?: SkillsPluginOptions | false;
}

/**
 * Options for the skills served over MCP
 */
export interface SkillsPluginOptions {
  /** Include the built-in `docs-research` skill. Default: true */
  builtin?: boolean;
  /**
   * Directory (relative to the site directory) containing skill directories,
   * each with a `SKILL.md` at its root, per the Agent Skills specification.
   */
  dir?: string;
}

/**
 * One file of a packaged skill, as stored in `skills.json`
 */
export interface SkillFile {
  /** Path relative to the skill root, using `/` separators (e.g. `SKILL.md`, `references/api.md`) */
  path: string;
  /** MIME type served on `resources/read` */
  mimeType: string;
  /** UTF-8 text content (text files) */
  text?: string;
  /** Base64 content (binary files) */
  blob?: string;
  /** `sha256:<hex>` digest of the file's raw bytes */
  digest: string;
  /** Size of the file's raw bytes */
  size: number;
}

/**
 * A packaged skill, as stored in `skills.json`
 */
export interface SkillArtifact {
  /**
   * Skill path: the part of the `skill://` URI before the file path. Its last
   * segment must equal `frontmatter.name`. The packager uses the bare name
   * (e.g. `docs-research` → `skill://docs-research/SKILL.md`).
   */
  skillPath: string;
  /** SKILL.md YAML frontmatter rendered as JSON (always has `name` and `description`) */
  frontmatter: Record<string, unknown> & { name: string; description: string };
  /** Every file in the skill, SKILL.md first */
  files: SkillFile[];
}

/**
 * Contents of the `skills.json` build artifact
 */
export interface SkillsArtifact {
  version: 1;
  skills: SkillArtifact[];
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
    url?: string;
    urlBase?: 'origin' | 'site';
  };
  excludeRoutes: string[];
  /** Indexers to run. undefined means ['local'], false disables indexing */
  indexers: string[] | false | undefined;
  /** Search provider module */
  search: string;
  /** Skills options; false disables skills */
  skills?: SkillsPluginOptions | false;
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
 * A search result returned by a search provider
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
  /** Number of skills written to skills.json */
  skillCount?: number;
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
   * Search provider. Default: 'local'.
   *
   * Accepts either a module specifier (string) loaded via dynamic `import()`,
   * or a {@link SearchProvider} instance. Pass an instance when running in a
   * bundled environment (Cloudflare Workers, etc.) where dynamic import of
   * arbitrary specifiers is not available.
   */
  search?: string | SearchProvider;
  /**
   * Ranking options for the built-in local search. See {@link LocalSearchConfig}.
   * Ignored when `search` is a custom provider.
   */
  localSearch?: LocalSearchConfig;
  /**
   * Instructions describing how to use the server and its tools.
   * Surfaced to MCP clients in the `server/discover` (2026-07-28) or
   * `initialize` (2025-era) result. When skills are served, a short pointer
   * listing their `skill://` URIs is appended.
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
  /** Path to skills.json file. Optional; omit to serve no skills. */
  skillsPath?: string;
}

/**
 * MCP Server configuration for pre-loaded data (e.g., Cloudflare Workers)
 */
export interface McpServerDataConfig extends McpServerBaseConfig {
  /** Pre-loaded docs data */
  docs: Record<string, ProcessedDoc>;
  /** Pre-loaded `search-index.json` contents */
  searchIndexData: Record<string, unknown>;
  /** Pre-loaded skills.json contents. Optional; omit to serve no skills. */
  skills?: SkillsArtifact;
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
  indexers: undefined, // Default: ['local'] applied at runtime
  search: 'local',
};
