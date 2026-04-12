export { default } from './plugin/docusaurus-plugin.js';
export { default as mcpServerPlugin } from './plugin/docusaurus-plugin.js';
export { McpDocsServer } from './mcp/server.js';

export type {
  McpServerPluginOptions,
  ProcessedDoc,
  DocHeading,
  SearchResult,
  McpManifest,
  McpServerConfig,
  McpServerFileConfig,
  McpServerDataConfig,
  DocsSearchParams,
  DocsFetchParams,
} from './types/index.js';

export { DEFAULT_PLUGIN_OPTIONS } from './types/index.js';

export type {
  ProviderContext,
  ContentIndexer,
  SearchProvider,
  SearchProviderInitData,
  SearchOptions,
} from './providers/types.js';

export { loadIndexer, loadSearchProvider } from './providers/loader.js';

export { docsSearchTool } from './mcp/tools/docs-search.js';
export { docsFetchTool } from './mcp/tools/docs-fetch.js';
