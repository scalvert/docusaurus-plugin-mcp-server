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
  McpDocsServerConfig,
  McpServerBundleConfig,
  McpServerFileConfig,
  McpServerDataConfig,
  DocsSearchParams,
  DocsFetchParams,
  LocalSearchConfig,
  LocalSearchField,
  SkillsPluginOptions,
  SkillsArtifact,
  SkillArtifact,
  SkillFile,
} from './types/index.js';

export { DEFAULT_PLUGIN_OPTIONS } from './types/index.js';

export type { ArtifactBundle } from './artifacts/bundle.js';

export { resolveServerUrl } from './plugin/resolve-server-url.js';
export type { ResolveServerUrlInput, ServerUrlBase } from './plugin/resolve-server-url.js';

export type {
  ProviderContext,
  ContentIndexer,
  SearchProvider,
  SearchRanker,
  SearchProviderInitData,
  SearchOptions,
} from './providers/types.js';

export { loadIndexer, loadSearchProvider } from './providers/loader.js';
export type { BuiltinSearchOptions } from './providers/loader.js';

// The built-in local search, for passing a provider instance directly (e.g. in
// bundled runtimes where `search: 'local'` cannot be resolved by name).
export { LocalSearchIndexer } from './providers/indexers/local-search-indexer.js';
export { LocalSearchProvider } from './providers/search/local-search-provider.js';

export { evaluateSearch } from './search/evaluate.js';
export type {
  SearchEvalCase,
  SearchEvalCaseResult,
  SearchEvalReport,
  EvaluateSearchOptions,
} from './search/evaluate.js';

export {
  buildSkillsArtifact,
  SkillValidationError,
  type BuildSkillsOptions,
} from './skills/packager.js';
export type { SiteMapDoc } from './skills/site-map.js';

export { ConfigurationError } from './errors.js';

export { docsSearchTool, docsSearchInputSchema } from './mcp/tools/docs-search.js';
export { docsFetchTool, docsFetchInputSchema } from './mcp/tools/docs-fetch.js';
