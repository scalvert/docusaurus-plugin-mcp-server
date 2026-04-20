import {
  // Docusaurus plugin (default export)
  mcpServerPlugin,

  // MCP Server class
  McpDocsServer,

  // Tool definitions
  docsSearchTool,
  docsFetchTool,

  // Utilities
  htmlToMarkdown,
  extractContent,
  extractHeadingsFromMarkdown,
  buildSearchIndex,

  // Provider types (for custom implementations)
  loadIndexer,
  loadSearchProvider,
  FlexSearchIndexer,
  FlexSearchProvider,

  // Default options
  DEFAULT_OPTIONS,
} from 'docusaurus-plugin-mcp-server';
