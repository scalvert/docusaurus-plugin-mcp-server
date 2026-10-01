import path from 'path';
import type { LoadContext, Plugin } from '@docusaurus/types';
import type {
  McpServerPluginOptions,
  ResolvedPluginOptions,
  SkillsArtifact,
} from '../types/index.js';
import { DEFAULT_PLUGIN_OPTIONS } from '../types/index.js';
import { extractDocs } from '../processing/extract-docs.js';
import { loadIndexer, removedBuiltinError } from '../providers/loader.js';
import { MIGRATION_GUIDE } from '../errors.js';
import type { ProviderContext } from '../providers/types.js';
import { resolveServerUrl } from './resolve-server-url.js';
import { buildSkillsArtifact } from '../skills/packager.js';
import { buildArtifactBundle, type IndexerOutput } from '../artifacts/bundle.js';
import { writeArtifactBundle } from '../artifacts/node.js';

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

      const { docs: validDocs, pageCount } = await extractDocs(outDir, {
        contentSelectors: resolvedOptions.contentSelectors,
        excludeSelectors: resolvedOptions.excludeSelectors,
        excludeRoutes: resolvedOptions.excludeRoutes,
        minContentLength: resolvedOptions.minContentLength,
      });
      if (pageCount === 0) {
        return;
      }
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
      const indexerOutputs: IndexerOutput[] = [];

      for (const indexerSpec of indexerSpecs) {
        try {
          const indexer = await loadIndexer(indexerSpec, { baseDir: context.siteDir });

          // Check if indexer wants to run (env var gating)
          if (indexer.shouldRun && !indexer.shouldRun()) {
            console.log(`[MCP] Skipping indexer: ${indexer.name}`);
            continue;
          }

          console.log(`[MCP] Running indexer: ${indexer.name}`);
          await indexer.initialize(providerContext);
          await indexer.indexDocuments(validDocs);

          const files = await indexer.finalize();
          const manifestData = indexer.getManifestData
            ? await indexer.getManifestData()
            : undefined;

          indexerOutputs.push({ name: indexer.name, files, manifestData });
        } catch (error) {
          console.error(`[MCP] Error running indexer "${indexerSpec}":`, error);
          throw error;
        }
      }

      // Package skills served via the MCP skills extension
      let skills: SkillsArtifact | undefined;
      if (resolvedOptions.skills !== false) {
        const skillsOptions = resolvedOptions.skills ?? {};
        skills = await buildSkillsArtifact({
          builtin: skillsOptions.builtin ?? true,
          dir: skillsOptions.dir ? path.resolve(context.siteDir, skillsOptions.dir) : undefined,
          siteTitle: context.siteConfig.title,
          siteUrl: baseUrl,
          siteTagline: context.siteConfig.tagline,
          docs: validDocs,
        });
        console.log(`[MCP] Packaged ${skills.skills.length} skill(s)`);
      }

      const bundle = buildArtifactBundle({
        docs: validDocs,
        baseUrl,
        server: { name: resolvedOptions.server.name, version: resolvedOptions.server.version },
        indexers: indexerOutputs,
        skills,
      });
      await writeArtifactBundle(mcpOutputDir, bundle);

      const elapsed = Date.now() - startTime;
      console.log(`[MCP] Artifacts written to ${mcpOutputDir}`);
      console.log(`[MCP] Generation complete in ${elapsed}ms`);
    },
  };
}

export { mcpServerPlugin };
