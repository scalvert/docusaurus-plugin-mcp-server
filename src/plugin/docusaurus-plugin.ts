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
import { DEFAULT_PLUGIN_OPTIONS } from '../types/index.js';
import { collectRoutes } from './route-collector.js';
import { extractContent, type ExtractContentOptions } from '../processing/html-parser.js';
import { htmlToMarkdown } from '../processing/html-to-markdown.js';
import { extractHeadingsFromMarkdown } from '../processing/heading-extractor.js';
import { loadIndexer, removedBuiltinError } from '../providers/loader.js';
import { MIGRATION_GUIDE } from '../errors.js';
import type { ProviderContext } from '../providers/types.js';
import { resolveServerUrl } from './resolve-server-url.js';
import { buildSkillsArtifact } from '../skills/packager.js';

/**
 * Resolve plugin options with defaults.
 */
function resolveOptions(options: McpServerPluginOptions): ResolvedPluginOptions {
  // 1.x tuned the built-in FlexSearch index here. 2.0's local search has no
  // build-time options, so fail loudly rather than silently ignoring them.
  if ('flexsearch' in (options as object)) {
    throw new Error(
      "[MCP] The 'flexsearch' plugin option was removed in docusaurus-plugin-mcp-server 2.0. " +
        'The built-in local search needs no build-time tuning; remove the option. ' +
        "Field boosts can be set at runtime with the server's 'localSearch' option. " +
        `See ${MIGRATION_GUIDE}.`
    );
  }
  // The provider is chosen where the server runs, not at build time, so this
  // option does nothing. A 1.x value of 'flexsearch' still means a stale
  // config, so reject it like the indexer name.
  if (options.search === 'flexsearch') {
    throw removedBuiltinError('search provider');
  }
  return {
    ...DEFAULT_PLUGIN_OPTIONS,
    ...options,
    server: {
      ...DEFAULT_PLUGIN_OPTIONS.server,
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

    const markdown = await htmlToMarkdown(extracted.contentHtml);

    if (!markdown || markdown.trim().length < options.minContentLength) {
      console.warn(`[MCP] Insufficient content in ${htmlPath}`);
      return null;
    }

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
      const serverUrl = resolveServerUrl({
        siteUrl: context.siteConfig.url,
        baseUrl: context.siteConfig.baseUrl,
        outputDir: resolvedOptions.outputDir,
        server: resolvedOptions.server,
      });

      setGlobalData({
        serverUrl,
        serverName: resolvedOptions.server.name,
      });
    },

    async postBuild({ outDir }) {
      console.log('[MCP] Starting MCP artifact generation...');
      const startTime = Date.now();

      if (resolvedOptions.indexers === false) {
        console.log('[MCP] Indexing disabled, skipping artifact generation');
        return;
      }

      const routes = await collectRoutes(outDir, resolvedOptions.excludeRoutes);
      console.log(`[MCP] Found ${routes.length} routes to process`);

      if (routes.length === 0) {
        console.warn('[MCP] No routes found to process');
        return;
      }

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

      const validDocs = processedDocs.filter((doc): doc is ProcessedDoc => doc !== null);
      console.log(`[MCP] Successfully processed ${validDocs.length} documents`);

      if (validDocs.length === 0) {
        console.warn('[MCP] No valid documents to index');
        return;
      }

      const mcpOutputDir = path.join(outDir, resolvedOptions.outputDir);
      // Resolve the site's baseUrl (e.g. "/docs/") against the origin so document
      // URLs are correct for sites served under a sub-path. Use the URL constructor
      // rather than path.join, which would collapse "https://" into "https:/".
      const baseUrl = new URL(context.siteConfig.baseUrl, context.siteConfig.url).href;
      const providerContext: ProviderContext = {
        baseUrl,
        serverName: resolvedOptions.server.name,
        serverVersion: resolvedOptions.server.version,
        outputDir: mcpOutputDir,
      };

      const indexerSpecs = resolvedOptions.indexers ?? ['local'];

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

      // Package skills served via the MCP skills extension
      let skillCount: number | undefined;
      if (resolvedOptions.skills !== false) {
        const skillsOptions = resolvedOptions.skills ?? {};
        const skills = await buildSkillsArtifact({
          builtin: skillsOptions.builtin ?? true,
          dir: skillsOptions.dir ? path.resolve(context.siteDir, skillsOptions.dir) : undefined,
          siteTitle: context.siteConfig.title,
          siteUrl: baseUrl,
          siteTagline: context.siteConfig.tagline,
          docs: validDocs,
        });
        await fs.writeJson(path.join(mcpOutputDir, 'skills.json'), skills, { spaces: 0 });
        skillCount = skills.skills.length;
        console.log(`[MCP] Packaged ${skillCount} skill(s)`);
      }

      // Write manifest (only if at least one indexer ran)
      if (indexerNames.length > 0) {
        const manifest: McpManifest = {
          version: resolvedOptions.server.version,
          buildTime: new Date().toISOString(),
          docCount: validDocs.length,
          serverName: resolvedOptions.server.name,
          baseUrl,
          indexers: indexerNames,
          ...(skillCount !== undefined ? { skillCount } : {}),
        };

        await fs.writeJson(path.join(mcpOutputDir, 'manifest.json'), manifest, { spaces: 2 });
      }

      const elapsed = Date.now() - startTime;
      console.log(`[MCP] Artifacts written to ${mcpOutputDir}`);
      console.log(`[MCP] Generation complete in ${elapsed}ms`);
    },
  };
}

export { mcpServerPlugin };
