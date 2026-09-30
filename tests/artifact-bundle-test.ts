import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import type { LoadContext, Plugin } from '@docusaurus/types';
import {
  ARTIFACT_BUNDLE_FORMAT_VERSION,
  buildArtifactBundle,
  documentId,
  parseArtifactBundle,
  type ArtifactBundle,
  type BuildArtifactBundleInput,
} from '../src/artifacts/bundle.js';
import { readArtifactBundle, writeArtifactBundle } from '../src/artifacts/node.js';
import { ConfigurationError } from '../src/errors.js';
import mcpServerPlugin from '../src/plugin/docusaurus-plugin.js';
import type { McpServerPluginOptions, ProcessedDoc } from '../src/types/index.js';

const intro: ProcessedDoc = {
  route: '/intro',
  title: 'Intro',
  description: 'Start here',
  markdown: '# Intro\n\nWelcome.',
  headings: [],
};
const guide: ProcessedDoc = {
  route: '/guides/setup',
  title: 'Setup',
  description: '',
  markdown: '# Setup\n\nInstall it.',
  headings: [],
};

function input(overrides: Partial<BuildArtifactBundleInput> = {}): BuildArtifactBundleInput {
  return {
    docs: [intro, guide],
    baseUrl: 'https://acme.dev/docs/',
    server: { name: 'acme-docs', version: '2.2.0' },
    indexers: [],
    buildTime: '2026-09-30T00:00:00.000Z',
    ...overrides,
  };
}

// Plugin progress logs are expected here; keep test output readable.
beforeAll(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
});
afterAll(() => {
  vi.restoreAllMocks();
});

describe('documentId', () => {
  it('joins the base URL and route without doubling the slash', () => {
    expect(documentId(intro, 'https://acme.dev/docs/')).toBe('https://acme.dev/docs/intro');
    expect(documentId(intro, 'https://acme.dev/docs')).toBe('https://acme.dev/docs/intro');
    expect(documentId(intro)).toBe('/intro');
  });
});

describe('buildArtifactBundle', () => {
  it('keys documents by document ID and describes the build in the manifest', () => {
    const bundle = buildArtifactBundle(input());

    expect(bundle.formatVersion).toBe(ARTIFACT_BUNDLE_FORMAT_VERSION);
    expect(Object.keys(bundle.docs)).toEqual([
      'https://acme.dev/docs/intro',
      'https://acme.dev/docs/guides/setup',
    ]);
    expect(bundle.manifest).toEqual({
      version: '2.2.0',
      buildTime: '2026-09-30T00:00:00.000Z',
      docCount: 2,
      serverName: 'acme-docs',
      baseUrl: 'https://acme.dev/docs/',
      indexers: [],
    });
    expect(bundle).not.toHaveProperty('searchIndex');
    expect(bundle).not.toHaveProperty('skills');
    expect(bundle).not.toHaveProperty('extras');
  });

  it('writes documents even when no indexer produced them', () => {
    const bundle = buildArtifactBundle(
      input({ indexers: [{ name: 'algolia', files: new Map() }] })
    );
    expect(Object.keys(bundle.docs)).toHaveLength(2);
    expect(bundle.manifest.indexers).toEqual(['algolia']);
  });

  it('takes the search index from whichever indexer emits search-index.json', () => {
    const bundle = buildArtifactBundle(
      input({
        indexers: [{ name: 'custom', files: new Map([['search-index.json', { engine: 'x' }]]) }],
      })
    );
    expect(bundle.searchIndex).toEqual({ engine: 'x' });
  });

  it('records getManifestData under manifest.indexerData', () => {
    const bundle = buildArtifactBundle(
      input({
        indexers: [
          { name: 'local', files: new Map(), manifestData: { searchEngine: 'local' } },
          { name: 'algolia', files: new Map() },
        ],
      })
    );
    expect(bundle.manifest.indexerData).toEqual({ local: { searchEngine: 'local' } });
  });

  it('counts packaged skills', () => {
    const bundle = buildArtifactBundle(input({ skills: { version: 1, skills: [] } }));
    expect(bundle.skills).toEqual({ version: 1, skills: [] });
    expect(bundle.manifest.skillCount).toBe(0);
  });

  it('keeps other indexer files as extras', () => {
    const bundle = buildArtifactBundle(
      input({
        indexers: [
          {
            name: 'algolia',
            files: new Map<string, unknown>([
              ['algolia-settings.json', { a: 1 }],
              ['algolia/records.json', [1, 2]],
            ]),
          },
        ],
      })
    );
    expect(bundle.extras).toEqual({
      'algolia-settings.json': { a: 1 },
      'algolia/records.json': [1, 2],
    });
  });

  it('ignores docs.json from the local indexer silently and from others with a warning', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const stale = { 'https://elsewhere/x': intro };

    const bundle = buildArtifactBundle(
      input({
        indexers: [
          { name: 'local', files: new Map([['docs.json', stale]]) },
          { name: 'custom', files: new Map([['docs.json', stale]]) },
        ],
      })
    );

    expect(Object.keys(bundle.docs)).not.toContain('https://elsewhere/x');
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]?.[0]).toContain('"custom" returned docs.json');
    warn.mockRestore();
  });

  it.each(['bundle.json', 'manifest.json', 'skills.json'])(
    'rejects an indexer that returns %s',
    (filename) => {
      expect(() =>
        buildArtifactBundle(
          input({ indexers: [{ name: 'rogue', files: new Map([[filename, {}]]) }] })
        )
      ).toThrow(ConfigurationError);
      expect(() =>
        buildArtifactBundle(
          input({ indexers: [{ name: 'rogue', files: new Map([[filename, {}]]) }] })
        )
      ).toThrow(`"rogue" returned ${filename}, which the plugin writes itself`);
    }
  );

  it('rejects two indexers that both emit search-index.json', () => {
    const files = () => new Map([['search-index.json', {}]]);
    expect(() =>
      buildArtifactBundle(
        input({
          indexers: [
            { name: 'local', files: files() },
            { name: 'custom', files: files() },
          ],
        })
      )
    ).toThrow('"local" and "custom" both returned search-index.json');
  });

  it('rejects a search-index.json that is not an object', () => {
    expect(() =>
      buildArtifactBundle(
        input({ indexers: [{ name: 'x', files: new Map([['search-index.json', [1]]]) }] })
      )
    ).toThrow('not a JSON object');
  });

  it('rejects two indexers that emit the same extra', () => {
    const files = () => new Map([['shared.json', {}]]);
    expect(() =>
      buildArtifactBundle(
        input({
          indexers: [
            { name: 'a', files: files() },
            { name: 'b', files: files() },
          ],
        })
      )
    ).toThrow('"a" and "b" both returned shared.json');
  });

  it.each(['../escape.json', '/abs.json', 'C:\\x.json', 'a//b.json', 'a/../../b.json', ''])(
    'rejects the unsafe extras filename %j',
    (filename) => {
      expect(() =>
        buildArtifactBundle(input({ indexers: [{ name: 'x', files: new Map([[filename, {}]]) }] }))
      ).toThrow('invalid artifact filename');
    }
  );
});

describe('parseArtifactBundle', () => {
  const valid = () => JSON.parse(JSON.stringify(buildArtifactBundle(input()))) as ArtifactBundle;

  it('accepts a bundle that survived JSON serialization', () => {
    const bundle = valid();
    expect(parseArtifactBundle(bundle)).toBe(bundle);
  });

  it('asks for an upgrade when the bundle is newer than the runtime', () => {
    const bundle = { ...valid(), formatVersion: ARTIFACT_BUNDLE_FORMAT_VERSION + 1 };
    expect(() => parseArtifactBundle(bundle)).toThrow(/Upgrade docusaurus-plugin-mcp-server/);
  });

  it.each<[string, (b: Record<string, unknown>) => void, RegExp]>([
    ['not an object', () => {}, /expected a JSON object/],
    ['no formatVersion', (b) => delete b.formatVersion, /missing formatVersion/],
    ['an older formatVersion', (b) => (b.formatVersion = 0), /unsupported formatVersion 0/],
    ['no manifest', (b) => delete b.manifest, /missing manifest/],
    [
      'a manifest without serverName',
      (b) => delete (b.manifest as Record<string, unknown>).serverName,
      /string serverName and version/,
    ],
    [
      'a manifest without docCount',
      (b) => delete (b.manifest as Record<string, unknown>).docCount,
      /numeric docCount/,
    ],
    ['no docs', (b) => delete b.docs, /missing docs/],
    [
      'a document without markdown',
      (b) => delete (Object.values(b.docs as object)[0] as Record<string, unknown>).markdown,
      /document "https:\/\/acme.dev\/docs\/intro" needs string route, title, and markdown/,
    ],
    ['a non-object searchIndex', (b) => (b.searchIndex = []), /searchIndex must be an object/],
    ['skills without a skills array', (b) => (b.skills = { version: 1 }), /skills array/],
    ['non-object extras', (b) => (b.extras = 'x'), /extras must be an object/],
  ])('rejects %s with a rebuild instruction', (_label, mutate, message) => {
    const bundle = valid() as unknown as Record<string, unknown>;
    mutate(bundle);
    const data = _label === 'not an object' ? 'nope' : bundle;

    let error: unknown;
    try {
      parseArtifactBundle(data, 'build/mcp/bundle.json');
    } catch (e) {
      error = e;
    }
    expect(error).toBeInstanceOf(ConfigurationError);
    expect((error as Error).message).toMatch(message);
    expect((error as Error).message).toContain('build/mcp/bundle.json');
    expect((error as Error).message).toContain('Rebuild the site');
  });
});

describe('writeArtifactBundle / readArtifactBundle', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'mcp-bundle-'));
  });
  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  const full = () =>
    buildArtifactBundle(
      input({
        indexers: [
          {
            name: 'local',
            files: new Map<string, unknown>([
              ['search-index.json', { engine: 'local', version: 1 }],
              ['nested/extra.json', { hello: 'world' }],
            ]),
            manifestData: { searchEngine: 'local' },
          },
        ],
        skills: { version: 1, skills: [] },
      })
    );

  const readJson = async (file: string) =>
    JSON.parse(await fs.readFile(path.join(dir, file), 'utf8'));

  it('round-trips through bundle.json', async () => {
    const bundle = full();
    await writeArtifactBundle(dir, bundle);
    expect(await readArtifactBundle(dir)).toEqual(bundle);
  });

  it('also writes each member as its own file for 2.x deployments', async () => {
    const bundle = full();
    await writeArtifactBundle(dir, bundle);

    expect(await readJson('docs.json')).toEqual(bundle.docs);
    expect(await readJson('search-index.json')).toEqual(bundle.searchIndex);
    expect(await readJson('skills.json')).toEqual(bundle.skills);
    expect(await readJson('manifest.json')).toEqual(bundle.manifest);
    expect(await readJson('nested/extra.json')).toEqual({ hello: 'world' });
  });

  it('skips optional member files the bundle does not have', async () => {
    await writeArtifactBundle(dir, buildArtifactBundle(input()));
    expect((await fs.readdir(dir)).sort()).toEqual(['bundle.json', 'docs.json', 'manifest.json']);
  });

  it('reads the 2.0/2.1 per-file layout when bundle.json is absent', async () => {
    const bundle = full();
    await writeArtifactBundle(dir, bundle);
    await fs.rm(path.join(dir, 'bundle.json'));

    const { extras, ...withoutExtras } = bundle;
    expect(extras).toBeDefined();
    expect(await readArtifactBundle(dir)).toEqual(withoutExtras);
  });

  it('explains what is missing when neither layout is present', async () => {
    await expect(readArtifactBundle(dir)).rejects.toThrow(
      /found neither bundle.json nor manifest.json and docs.json/
    );
  });

  it('names the file when a member is not valid JSON', async () => {
    await fs.writeFile(path.join(dir, 'bundle.json'), '{nope');
    await expect(readArtifactBundle(dir)).rejects.toThrow(/Could not read .*bundle.json/);
  });
});

describe('plugin postBuild writes the artifact bundle', () => {
  const PAGE = `<!doctype html><html><head><title>Intro | Acme</title></head>
<body><article><h1>Intro</h1><p>${'Welcome to the Acme documentation. '.repeat(5)}</p></article></body></html>`;

  let siteDir: string;
  let outDir: string;

  beforeEach(async () => {
    siteDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mcp-bundle-site-'));
    outDir = path.join(siteDir, 'build');
    await fs.mkdir(path.join(outDir, 'intro'), { recursive: true });
    await fs.writeFile(path.join(outDir, 'intro', 'index.html'), PAGE);
  });
  afterEach(async () => {
    await fs.rm(siteDir, { recursive: true, force: true });
  });

  async function writeIndexer(name: string, finalize: string): Promise<string> {
    const file = path.join(siteDir, `${name}.mjs`);
    await fs.writeFile(
      file,
      `export default class {
  name = ${JSON.stringify(name)};
  async initialize() {}
  async indexDocuments() {}
  async finalize() { return new Map(${finalize}); }
}
`
    );
    return pathToFileURL(file).href;
  }

  async function runBuild(options: McpServerPluginOptions) {
    const context = {
      siteDir,
      siteConfig: { url: 'https://acme.dev', baseUrl: '/', title: 'Acme Docs' },
    } as unknown as LoadContext;
    const plugin = mcpServerPlugin(context, { skills: false, ...options }) as Plugin & {
      postBuild: (props: { outDir: string }) => Promise<void>;
    };
    await plugin.postBuild({ outDir });
    return path.join(outDir, 'mcp');
  }

  it('writes bundle.json with the local search index and its manifest data', async () => {
    const mcpDir = await runBuild({ server: { name: 'acme-docs', version: '2.2.0' } });
    const bundle = await readArtifactBundle(mcpDir);

    expect(Object.keys(bundle.docs)).toEqual(['https://acme.dev/intro']);
    expect(bundle.searchIndex).toMatchObject({ engine: 'local', version: 1 });
    expect(bundle.manifest).toMatchObject({
      serverName: 'acme-docs',
      version: '2.2.0',
      indexers: ['local'],
      indexerData: { local: { searchEngine: 'local' } },
    });
  });

  it('writes documents for a site that only runs a custom indexer', async () => {
    const custom = await writeIndexer('algolia', `[['algolia.json', { records: 1 }]]`);
    const mcpDir = await runBuild({ indexers: [custom] });

    const docs = JSON.parse(await fs.readFile(path.join(mcpDir, 'docs.json'), 'utf8'));
    expect(Object.keys(docs)).toEqual(['https://acme.dev/intro']);

    const bundle = await readArtifactBundle(mcpDir);
    expect(bundle.manifest.indexers).toEqual(['algolia']);
    expect(bundle.extras).toEqual({ 'algolia.json': { records: 1 } });
    expect(bundle).not.toHaveProperty('searchIndex');
  });

  it('fails the build when an indexer overwrites a plugin-owned file', async () => {
    const rogue = await writeIndexer('rogue', `[['manifest.json', {}]]`);
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});

    await expect(runBuild({ indexers: ['local', rogue] })).rejects.toThrow(
      '"rogue" returned manifest.json'
    );
    error.mockRestore();
  });

  it('writes nothing when indexing is disabled', async () => {
    const mcpDir = await runBuild({ indexers: false });
    await expect(fs.access(mcpDir)).rejects.toThrow();
  });
});
