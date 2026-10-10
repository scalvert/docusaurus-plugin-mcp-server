/**
 * The build pipeline: a built site directory and resolved plugin options in,
 * the artifact bundle out. Knows nothing about Docusaurus; the plugin's
 * `postBuild` hook adapts its `LoadContext` to {@link SiteInfo}, calls
 * {@link buildOutputs}, and writes the result.
 *
 * Writes nothing itself, so tests can run HTML fixtures through the whole
 * pipeline without stubbing Docusaurus or reading files back.
 */

import path from 'path';
import type {
  McpServerPluginOptions,
  ProcessedDoc,
  ResolvedPluginOptions,
  SkillsArtifact,
} from '../types/index.js';
import { DEFAULT_PLUGIN_OPTIONS } from '../types/index.js';
import { extractDocs } from '../processing/extract-docs.js';
import { loadIndexer, removedBuiltinError } from '../providers/loader.js';
import type { ProviderContext } from '../providers/types.js';
import { MIGRATION_GUIDE } from '../errors.js';
import { packageSkills, readSkillSources, type SkillSource } from '../skills/packager.js';
import { compileGuides, GuideValidationError } from '../guides/compile.js';
import {
  buildArtifactBundle,
  type ArtifactBundle,
  type IndexerOutput,
} from '../artifacts/bundle.js';

/** What the pipeline needs to know about the site, from the Docusaurus config. */
export interface SiteInfo {
  /** The site's source directory; relative module paths and the skills dir resolve against it */
  siteDir: string;
  /** Site origin, e.g. `https://docs.example.com` */
  url: string;
  /** Site base path, e.g. `/` or `/docs/` */
  baseUrl: string;
  title: string;
  tagline?: string;
}

export interface BuildInput {
  /** The built site, e.g. Docusaurus's `build/` */
  outDir: string;
  options: ResolvedPluginOptions;
  site: SiteInfo;
}

export type BuildOutputs =
  | {
      kind: 'built';
      bundle: ArtifactBundle;
      /** Absolute directory the bundle belongs in, e.g. `build/mcp` */
      outputDir: string;
    }
  | {
      kind: 'skipped';
      /** `indexing-disabled`: `indexers: false`; `no-pages`: no HTML found; `no-documents`: none survived extraction */
      reason: 'indexing-disabled' | 'no-pages' | 'no-documents';
    };

/** Plugin options with defaults applied. Rejects options removed in 2.0. */
export function resolvePluginOptions(options: McpServerPluginOptions): ResolvedPluginOptions {
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
 * Extract the site's documents, run the indexers, package skills, and
 * assemble the artifact bundle. Logs progress to the console; throws if an
 * indexer or skill fails.
 */
export async function buildOutputs({ outDir, options, site }: BuildInput): Promise<BuildOutputs> {
  if (options.indexers === false) {
    console.log('[MCP] Indexing disabled, skipping artifact generation');
    return { kind: 'skipped', reason: 'indexing-disabled' };
  }

  // Resolve the site's baseUrl (e.g. "/docs/") against the origin so document
  // URLs are correct for sites served under a sub-path. Use the URL constructor
  // rather than path.join, which would collapse "https://" into "https:/".
  const baseUrl = new URL(site.baseUrl, site.url).href;

  const {
    docs,
    pageCount,
    guides: pageGuides,
  } = await extractDocs(outDir, {
    contentSelectors: options.contentSelectors,
    excludeSelectors: options.excludeSelectors,
    excludeRoutes: options.excludeRoutes,
    minContentLength: options.minContentLength,
    baseUrl,
  });
  if (pageCount === 0) {
    return { kind: 'skipped', reason: 'no-pages' };
  }
  console.log(`[MCP] Successfully processed ${docs.length} documents`);

  if (docs.length === 0) {
    console.warn('[MCP] No valid documents to index');
    return { kind: 'skipped', reason: 'no-documents' };
  }

  const outputDir = path.join(outDir, options.outputDir);
  const providerContext: ProviderContext = {
    baseUrl,
    serverName: options.server.name,
    serverVersion: options.server.version,
    outputDir,
  };

  // Fail on guide errors before the slower indexing, and report every one.
  const guides = compileGuides({ pages: pageGuides, baseUrl });
  if (guides.errors.length > 0) {
    throw new GuideValidationError(guides.errors);
  }
  for (const warning of guides.warnings) {
    console.warn(`[MCP] Agent guide: ${warning}`);
  }

  const indexers = await runIndexers(options, site, providerContext, docs);
  const skills = await buildSkills(options, site, baseUrl, docs, guides.sources);

  const bundle = buildArtifactBundle({
    docs,
    baseUrl,
    server: { name: options.server.name, version: options.server.version },
    indexers,
    skills,
    guides: { count: skills ? guides.sources.length : 0, warnings: guides.warnings },
  });
  return { kind: 'built', bundle, outputDir };
}

async function runIndexers(
  options: ResolvedPluginOptions,
  site: SiteInfo,
  providerContext: ProviderContext,
  docs: ProcessedDoc[]
): Promise<IndexerOutput[]> {
  const outputs: IndexerOutput[] = [];
  for (const spec of options.indexers || ['local']) {
    try {
      const indexer = await loadIndexer(spec, { baseDir: site.siteDir });

      // Check if indexer wants to run (env var gating)
      if (indexer.shouldRun && !indexer.shouldRun()) {
        console.log(`[MCP] Skipping indexer: ${indexer.name}`);
        continue;
      }

      console.log(`[MCP] Running indexer: ${indexer.name}`);
      await indexer.initialize(providerContext);
      await indexer.indexDocuments(docs);

      const files = await indexer.finalize();
      const manifestData = indexer.getManifestData ? await indexer.getManifestData() : undefined;

      outputs.push({ name: indexer.name, files, manifestData });
    } catch (error) {
      console.error(`[MCP] Error running indexer "${spec}":`, error);
      throw error;
    }
  }
  return outputs;
}

/**
 * Skills served via the MCP skills extension: the built-in and author skills
 * plus one per agent guide. Undefined when `skills: false`.
 */
async function buildSkills(
  options: ResolvedPluginOptions,
  site: SiteInfo,
  baseUrl: string,
  docs: ProcessedDoc[],
  guideSources: SkillSource[]
): Promise<SkillsArtifact | undefined> {
  if (options.skills === false) {
    if (guideSources.length > 0) {
      console.warn(
        `[MCP] Found ${guideSources.length} agent guide(s), but skills are disabled (skills: false), so they aren't served`
      );
    }
    return undefined;
  }
  const skillsOptions = options.skills ?? {};
  const sources = await readSkillSources({
    builtin: skillsOptions.builtin ?? true,
    dir: skillsOptions.dir ? path.resolve(site.siteDir, skillsOptions.dir) : undefined,
    siteTitle: site.title,
    siteUrl: baseUrl,
    siteTagline: site.tagline,
    docs,
  });
  const skills = packageSkills([...sources, ...guideSources]);
  console.log(
    guideSources.length > 0
      ? `[MCP] Packaged ${skills.skills.length} skill(s), including ${guideSources.length} agent guide(s)`
      : `[MCP] Packaged ${skills.skills.length} skill(s)`
  );
  return skills;
}
