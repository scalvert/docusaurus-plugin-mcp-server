import path from 'path';
import fs from 'fs-extra';
import pMap from 'p-map';
import type { LoadContext, Plugin } from '@docusaurus/types';
import type {
  McpServerPluginOptions,
  ResolvedPluginOptions,
  ProcessedDoc,
  McpManifest,
} from '../types/index.js';
import { DEFAULT_OPTIONS } from '../types/index.js';
import { collectRoutes } from './route-collector.js';
import { extractContent, type ExtractContentOptions } from '../processing/html-parser.js';
import { htmlToMarkdown } from '../processing/html-to-markdown.js';
import { extractHeadingsFromMarkdown } from '../processing/heading-extractor.js';
import { buildSearchIndex, exportSearchIndex } from '../search/flexsearch-indexer.js';

/**
 * Resolve plugin options with defaults
 */
function resolveOptions(options: McpServerPluginOptions): ResolvedPluginOptions {
  return {
    ...DEFAULT_OPTIONS,
    ...options,
    server: {
      ...DEFAULT_OPTIONS.server,
      ...options.server,
    },
  };
}

/**
 * Options for processing an HTML file
 */
interface ProcessHtmlOptions {
  contentSelectors: string[];
  excludeSelectors: string[];
  minContentLength: number;
}

/**
 * Process a single HTML file into a ProcessedDoc
 */
async function processHtmlFile(
  htmlPath: string,
  route: string,
  options: ProcessHtmlOptions
): Promise<ProcessedDoc | null> {
  try {
    // Extract content from HTML
    const extractOptions: ExtractContentOptions = {
      contentSelectors: options.contentSelectors,
      excludeSelectors: options.excludeSelectors,
    };
    const extracted = await extractContent(htmlPath, extractOptions);

    if (!extracted.contentHtml) {
      console.warn(`[MCP] No content found in ${htmlPath}`);
      return null;
    }

    // Convert to markdown
    const markdown = await htmlToMarkdown(extracted.contentHtml);

    if (!markdown || markdown.trim().length < options.minContentLength) {
      console.warn(`[MCP] Insufficient content in ${htmlPath}`);
      return null;
    }

    // Extract headings
    const headings = extractHeadingsFromMarkdown(markdown);

    return {
      route,
      title: extracted.title,
      description: extracted.description,
      markdown,
      headings,
    };
  } catch (error) {
    console.error(`[MCP] Error processing ${htmlPath}:`, error);
    return null;
  }
}

/**
 * Docusaurus plugin that generates MCP server artifacts during build
 */
export default function mcpServerPlugin(
  context: LoadContext,
  options: McpServerPluginOptions
): Plugin {
  const resolvedOptions = resolveOptions(options);

  return {
    name: 'docusaurus-plugin-mcp-server',

    // Expose configuration to theme components via globalData
    async contentLoaded({ actions }) {
      const { setGlobalData } = actions;

      // Construct server URL from site URL + output directory
      const serverUrl = `${context.siteConfig.url}/${resolvedOptions.outputDir}`;

      setGlobalData({
        serverUrl,
        serverName: resolvedOptions.server.name,
      });
    },

    async postBuild({ outDir }) {
      console.log('[MCP] Starting MCP artifact generation...');
      const startTime = Date.now();

      // Collect routes from the build output
      const routes = await collectRoutes(outDir, resolvedOptions.excludeRoutes);
      console.log(`[MCP] Found ${routes.length} routes to process`);

      if (routes.length === 0) {
        console.warn('[MCP] No routes found to process');
        return;
      }

      // Process all HTML files in parallel (with concurrency limit)
      const processOptions: ProcessHtmlOptions = {
        contentSelectors: resolvedOptions.contentSelectors,
        excludeSelectors: resolvedOptions.excludeSelectors,
        minContentLength: resolvedOptions.minContentLength,
      };

      const processedDocs = await pMap(
        routes,
        async (route) => {
          return processHtmlFile(route.htmlPath, route.path, processOptions);
        },
        { concurrency: 10 }
      );

      // Filter out null results
      const validDocs = processedDocs.filter((doc): doc is ProcessedDoc => doc !== null);
      console.log(`[MCP] Successfully processed ${validDocs.length} documents`);

      if (validDocs.length === 0) {
        console.warn('[MCP] No valid documents to index');
        return;
      }

      // Build docs index
      const docsIndex: Record<string, ProcessedDoc> = {};
      for (const doc of validDocs) {
        docsIndex[doc.route] = doc;
      }

      // Build search index
      console.log('[MCP] Building search index...');
      const searchIndex = buildSearchIndex(validDocs);
      const exportedIndex = await exportSearchIndex(searchIndex);

      // Create manifest
      const manifest: McpManifest = {
        version: resolvedOptions.server.version,
        buildTime: new Date().toISOString(),
        docCount: validDocs.length,
        serverName: resolvedOptions.server.name,
        baseUrl: context.siteConfig.url,
      };

      // Write output files
      const mcpOutputDir = path.join(outDir, resolvedOptions.outputDir);
      await fs.ensureDir(mcpOutputDir);

      await Promise.all([
        fs.writeJson(path.join(mcpOutputDir, 'docs.json'), docsIndex, { spaces: 0 }),
        fs.writeJson(path.join(mcpOutputDir, 'search-index.json'), exportedIndex, { spaces: 0 }),
        fs.writeJson(path.join(mcpOutputDir, 'manifest.json'), manifest, { spaces: 2 }),
      ]);

      const elapsed = Date.now() - startTime;
      console.log(`[MCP] Artifacts written to ${mcpOutputDir}`);
      console.log(`[MCP] Generation complete in ${elapsed}ms`);
    },
  };
}

// Named export for ESM compatibility
export { mcpServerPlugin };
