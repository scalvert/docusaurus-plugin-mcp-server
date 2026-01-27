// Default export for Docusaurus plugin loading (requires default export)
export { default } from './plugin/docusaurus-plugin.js';
// Named export for explicit imports
export { default as mcpServerPlugin } from './plugin/docusaurus-plugin.js';
export { McpDocsServer } from './mcp/server.js';

export type {
  McpServerPluginOptions,
  ResolvedPluginOptions,
  ProcessedDoc,
  DocHeading,
  FlattenedRoute,
  SearchResult,
  McpManifest,
  McpServerConfig,
  McpServerFileConfig,
  McpServerDataConfig,
  DocsIndex,
  DocsSearchParams,
  DocsFetchParams,
  ExtractedContent,
} from './types/index.js';

export { DEFAULT_OPTIONS } from './types/index.js';

export type {
  ProviderContext,
  ContentIndexer,
  SearchProvider,
  SearchProviderInitData,
  SearchOptions,
  ContentIndexerModule,
  SearchProviderModule,
} from './providers/types.js';

export { loadIndexer, loadSearchProvider } from './providers/loader.js';
export { FlexSearchIndexer } from './providers/indexers/flexsearch-indexer.js';
export { FlexSearchProvider } from './providers/search/flexsearch-provider.js';

export { docsSearchTool } from './mcp/tools/docs-search.js';
export { docsFetchTool } from './mcp/tools/docs-fetch.js';

export { htmlToMarkdown } from './processing/html-to-markdown.js';
export { extractContent, parseHtml, parseHtmlFile } from './processing/html-parser.js';
export { extractHeadingsFromMarkdown, extractSection } from './processing/heading-extractor.js';
export { collectRoutes, discoverHtmlFiles } from './plugin/route-collector.js';
export {
  buildSearchIndex,
  searchIndex,
  exportSearchIndex,
  importSearchIndex,
  type FlexSearchDocument,
} from './search/flexsearch-core.js';
