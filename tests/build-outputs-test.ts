/**
 * The build pipeline end to end, without Docusaurus: the HTML fixture site in,
 * the artifact bundle out. The plugin's own tests (extract-golden-test,
 * plugin-skills-test) cover the adapter that writes it.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import fs from 'fs/promises';
import { existsSync } from 'fs';
import os from 'os';
import path from 'path';
import {
  buildOutputs,
  resolvePluginOptions,
  type SiteInfo,
} from '../src/pipeline/build-outputs.js';
import type { McpServerPluginOptions } from '../src/types/index.js';

const SITE = path.join(import.meta.dirname, 'fixtures', 'extract', 'site');
const EXPECTED_DOCS = path.join(
  import.meta.dirname,
  'fixtures',
  'extract',
  'expected',
  'defaults',
  'docs.json'
);

const site: SiteInfo = {
  siteDir: path.dirname(SITE),
  url: 'https://docs.example.com',
  baseUrl: '/',
  title: 'Example Docs',
};

function build(options: McpServerPluginOptions = {}, overrides: Partial<SiteInfo> = {}) {
  return buildOutputs({
    outDir: SITE,
    options: resolvePluginOptions(options),
    site: { ...site, ...overrides },
  });
}

beforeAll(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterAll(() => {
  vi.restoreAllMocks();
});

describe('buildOutputs', () => {
  it('builds the bundle the plugin writes, and writes nothing itself', async () => {
    const result = await build();
    if (result.kind !== 'built') throw new Error(`skipped: ${result.reason}`);

    const expected = JSON.parse(await fs.readFile(EXPECTED_DOCS, 'utf8'));
    expect(Object.keys(result.bundle.docs).sort()).toEqual(Object.keys(expected).sort());
    expect(result.bundle.manifest).toMatchObject({
      baseUrl: 'https://docs.example.com/',
      serverName: 'docs-mcp-server',
      docCount: Object.keys(expected).length,
      indexers: ['local'],
      skillCount: 1,
    });
    expect(result.bundle.searchIndex).toBeDefined();
    expect(result.bundle.skills?.skills.map((s) => s.skillPath)).toEqual(['docs-research']);
    expect(result.outputDir).toBe(path.join(SITE, 'mcp'));
    expect(existsSync(path.join(SITE, 'mcp'))).toBe(false);
  });

  it('keys documents under a sub-path base URL', async () => {
    const result = await build({ skills: false }, { baseUrl: '/handbook/' });
    if (result.kind !== 'built') throw new Error(`skipped: ${result.reason}`);
    const ids = Object.keys(result.bundle.docs);
    expect(ids.every((id) => id.startsWith('https://docs.example.com/handbook/'))).toBe(true);
    expect(result.bundle.skills).toBeUndefined();
  });

  it('skips when indexing is disabled', async () => {
    expect(await build({ indexers: false })).toEqual({
      kind: 'skipped',
      reason: 'indexing-disabled',
    });
  });

  it('skips when no page survives extraction', async () => {
    expect(await build({ minContentLength: Number.MAX_SAFE_INTEGER })).toEqual({
      kind: 'skipped',
      reason: 'no-documents',
    });
  });

  it('skips a directory with no pages', async () => {
    const empty = await fs.mkdtemp(path.join(os.tmpdir(), 'mcp-build-empty-'));
    try {
      const result = await buildOutputs({
        outDir: empty,
        options: resolvePluginOptions({}),
        site,
      });
      expect(result).toEqual({ kind: 'skipped', reason: 'no-pages' });
    } finally {
      await fs.rm(empty, { recursive: true, force: true });
    }
  });
});

describe('resolvePluginOptions', () => {
  it('applies defaults, merging server options', () => {
    const resolved = resolvePluginOptions({ server: { name: 'my-docs', version: '2.0.0' } });
    expect(resolved).toMatchObject({
      outputDir: 'mcp',
      server: { name: 'my-docs', version: '2.0.0' },
    });
  });

  it('rejects options removed in 2.0', () => {
    expect(() => resolvePluginOptions({ flexsearch: {} } as never)).toThrow(/flexsearch/);
    expect(() => resolvePluginOptions({ search: 'flexsearch' })).toThrow();
  });
});
