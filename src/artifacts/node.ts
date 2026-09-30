/**
 * Artifact bundle file IO for Node (build time, local dev, and the verify CLI).
 *
 * Edge runtimes import `bundle.json` through their bundler instead; this
 * module must not be reachable from the `./adapters` entry.
 */

import path from 'path';
import fs from 'fs-extra';
import { ConfigurationError } from '../errors.js';
import {
  ARTIFACT_BUNDLE_FORMAT_VERSION,
  ARTIFACT_FILES,
  parseArtifactBundle,
  type ArtifactBundle,
} from './bundle.js';

/**
 * Write an artifact bundle to `dir`.
 *
 * Writes `bundle.json` and, through 2.x, a per-file copy of each member
 * (`docs.json`, `search-index.json`, `skills.json`, `manifest.json`, and each
 * indexer extra) so deployments that import individual files keep working.
 */
export async function writeArtifactBundle(dir: string, bundle: ArtifactBundle): Promise<void> {
  await fs.ensureDir(dir);

  const write = async (filename: string, content: unknown, spaces = 0) => {
    const target = path.join(dir, filename);
    await fs.ensureDir(path.dirname(target));
    await fs.writeJson(target, content, { spaces });
  };

  await write(ARTIFACT_FILES.bundle, bundle);

  // 2.x compatibility copies; removed in 3.0 (ADR-0001).
  await write(ARTIFACT_FILES.docs, bundle.docs);
  if (bundle.searchIndex) {
    await write(ARTIFACT_FILES.searchIndex, bundle.searchIndex);
  }
  if (bundle.skills) {
    await write(ARTIFACT_FILES.skills, bundle.skills);
  }
  await write(ARTIFACT_FILES.manifest, bundle.manifest, 2);
  for (const [filename, content] of Object.entries(bundle.extras ?? {})) {
    await write(filename, content);
  }
}

async function readJsonMember(dir: string, filename: string): Promise<unknown> {
  const file = path.join(dir, filename);
  try {
    return await fs.readJson(file);
  } catch (error) {
    throw new ConfigurationError(
      `[MCP] Could not read ${file}: ${(error as Error).message}. ` +
        'Rebuild the site (docusaurus build) and redeploy the MCP output directory.',
      { cause: error }
    );
  }
}

/**
 * Read the artifact bundle in `dir`.
 *
 * Reads `bundle.json` when present. Otherwise assembles the bundle from the
 * per-file layout written by 2.0 and 2.1 (`manifest.json` and `docs.json`
 * required; `search-index.json` and `skills.json` optional). Indexer extras
 * can only be recovered from `bundle.json`.
 */
export async function readArtifactBundle(dir: string): Promise<ArtifactBundle> {
  const bundlePath = path.join(dir, ARTIFACT_FILES.bundle);
  if (await fs.pathExists(bundlePath)) {
    return parseArtifactBundle(await readJsonMember(dir, ARTIFACT_FILES.bundle), bundlePath);
  }

  const missing: string[] = [];
  for (const filename of [ARTIFACT_FILES.manifest, ARTIFACT_FILES.docs]) {
    if (!(await fs.pathExists(path.join(dir, filename)))) {
      missing.push(filename);
    }
  }
  if (missing.length > 0) {
    throw new ConfigurationError(
      `[MCP] No artifact bundle in ${dir}: found neither ${ARTIFACT_FILES.bundle} nor ${missing.join(' and ')}. ` +
        'Build the site with docusaurus-plugin-mcp-server configured, and check the outputDir.'
    );
  }

  const optional = async (filename: string) =>
    (await fs.pathExists(path.join(dir, filename))) ? readJsonMember(dir, filename) : undefined;

  const searchIndex = await optional(ARTIFACT_FILES.searchIndex);
  const skills = await optional(ARTIFACT_FILES.skills);

  return parseArtifactBundle(
    {
      formatVersion: ARTIFACT_BUNDLE_FORMAT_VERSION,
      manifest: await readJsonMember(dir, ARTIFACT_FILES.manifest),
      docs: await readJsonMember(dir, ARTIFACT_FILES.docs),
      ...(searchIndex !== undefined ? { searchIndex } : {}),
      ...(skills !== undefined ? { skills } : {}),
    },
    dir
  );
}
