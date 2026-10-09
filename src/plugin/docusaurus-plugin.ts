import type { LoadContext, Plugin } from '@docusaurus/types';
import type { McpServerPluginOptions } from '../types/index.js';
import { resolveServerUrl } from './resolve-server-url.js';
import { buildOutputs, resolvePluginOptions } from '../pipeline/build-outputs.js';
import { writeArtifactBundle } from '../artifacts/node.js';

/**
 * Docusaurus plugin that generates MCP server artifacts during build. An
 * adapter: the build pipeline (`src/pipeline/build-outputs.ts`) does the work; this
 * maps Docusaurus's context onto it and writes what it returns.
 */
export default function mcpServerPlugin(
  context: LoadContext,
  options: McpServerPluginOptions
): Plugin {
  const resolvedOptions = resolvePluginOptions(options);

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

      const result = await buildOutputs({
        outDir,
        options: resolvedOptions,
        site: {
          siteDir: context.siteDir,
          url: context.siteConfig.url,
          baseUrl: context.siteConfig.baseUrl,
          title: context.siteConfig.title,
          tagline: context.siteConfig.tagline,
        },
      });
      if (result.kind === 'skipped') {
        return;
      }

      await writeArtifactBundle(result.outputDir, result.bundle);

      const elapsed = Date.now() - startTime;
      console.log(`[MCP] Artifacts written to ${result.outputDir}`);
      console.log(`[MCP] Generation complete in ${elapsed}ms`);
    },
  };
}

export { mcpServerPlugin };
