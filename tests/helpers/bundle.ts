/**
 * Build an artifact bundle the way `docusaurus build` does, without HTML:
 * run the local indexer over the given documents and assemble its output.
 */

import { buildArtifactBundle, type ArtifactBundle } from '../../src/artifacts/bundle.js';
import { LocalSearchIndexer } from '../../src/providers/indexers/local-search-indexer.js';
import type { ProcessedDoc, SkillsArtifact } from '../../src/types/index.js';

export interface TestBundleOptions {
  baseUrl?: string;
  name?: string;
  version?: string;
  skills?: SkillsArtifact;
}

export async function buildTestBundle(
  docs: ProcessedDoc[],
  options: TestBundleOptions = {}
): Promise<ArtifactBundle> {
  const baseUrl = options.baseUrl ?? 'https://example.com';
  const server = { name: options.name ?? 'test-docs', version: options.version ?? '1.0.0' };

  const indexer = new LocalSearchIndexer();
  await indexer.initialize({
    baseUrl,
    serverName: server.name,
    serverVersion: server.version,
    outputDir: '',
  });
  await indexer.indexDocuments(docs);

  return buildArtifactBundle({
    docs,
    baseUrl,
    server,
    indexers: [
      {
        name: indexer.name,
        files: await indexer.finalize(),
        manifestData: await indexer.getManifestData(),
      },
    ],
    skills: options.skills,
    buildTime: '2026-01-01T00:00:00.000Z',
  });
}
