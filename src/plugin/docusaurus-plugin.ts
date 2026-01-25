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
import { loadIndexer } from '../providers/loader.js';
import type { ProviderContext } from '../providers/types.js';

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
    indexers: options.indexers,
    search: options.search ?? DEFAULT_OPTIONS.search,
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

      // Check if indexing is disabled
      if (resolvedOptions.indexers === false) {
        console.log('[MCP] Indexing disabled, skipping artifact generation');
        return;
      }

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

      // Create provider context
      const mcpOutputDir = path.join(outDir, resolvedOptions.outputDir);
      const providerContext: ProviderContext = {
        baseUrl: context.siteConfig.url,
        serverName: resolvedOptions.server.name,
        serverVersion: resolvedOptions.server.version,
        outputDir: mcpOutputDir,
      };

      // Determine which indexers to run
      // undefined = ['flexsearch'] for backward compatibility
      const indexerSpecs = resolvedOptions.indexers ?? ['flexsearch'];

      await fs.ensureDir(mcpOutputDir);

      const indexerNames: string[] = [];

      for (const indexerSpec of indexerSpecs) {
        try {
          const indexer = await loadIndexer(indexerSpec);

          // Check if indexer wants to run (env var gating)
          if (indexer.shouldRun && !indexer.shouldRun()) {
            console.log(`[MCP] Skipping indexer: ${indexer.name}`);
            continue;
          }

          console.log(`[MCP] Running indexer: ${indexer.name}`);
          await indexer.initialize(providerContext);
          await indexer.indexDocuments(validDocs);

          // Write artifacts from this indexer
          const artifacts = await indexer.finalize();
          for (const [filename, content] of artifacts) {
            await fs.writeJson(path.join(mcpOutputDir, filename), content, { spaces: 0 });
          }

          indexerNames.push(indexer.name);
        } catch (error) {
          console.error(`[MCP] Error running indexer "${indexerSpec}":`, error);
          throw error;
        }
      }

      // Write manifest (only if at least one indexer ran)
      if (indexerNames.length > 0) {
        const manifest: McpManifest = {
          version: resolvedOptions.server.version,
          buildTime: new Date().toISOString(),
          docCount: validDocs.length,
          serverName: resolvedOptions.server.name,
          baseUrl: context.siteConfig.url,
          indexers: indexerNames,
        };

        await fs.writeJson(path.join(mcpOutputDir, 'manifest.json'), manifest, { spaces: 2 });
      }

      const elapsed = Date.now() - startTime;
      console.log(`[MCP] Artifacts written to ${mcpOutputDir}`);
      console.log(`[MCP] Generation complete in ${elapsed}ms`);
    },
  };
}

// Named export for ESM compatibility
export { mcpServerPlugin };
