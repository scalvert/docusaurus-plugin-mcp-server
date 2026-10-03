/**
 * Module paths in `indexers` and `search` resolve against the user's project,
 * not this package: an indexer path against the site directory, a search
 * provider path against the working directory. (Before 2.2 they resolved
 * against the package's dist/, so the README's `./my-search.js` examples
 * failed with "module not found".)
 */
import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { LoadContext, Plugin } from '@docusaurus/types';
import { loadIndexer, loadSearchProvider } from '../src/providers/loader.js';
import { McpDocsServer } from '../src/mcp/server.js';
import mcpServerPlugin from '../src/plugin/docusaurus-plugin.js';
import { buildTestBundle } from './helpers/bundle.js';

const INDEXER = `export default class {
  name = 'extra';
  async initialize() {}
  async indexDocuments(docs) { this.count = docs.length; }
  async finalize() { return new Map([['extra.json', { count: this.count }]]); }
}
`;
const PROVIDER = `export default class {
  name = 'full';
  async initialize() {}
  isReady() { return true; }
  async search() { return []; }
}
`;
const RANKER = "export default { name: 'ranker', search: async () => [] };\n";

let dir: string;

beforeAll(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), 'mcp-module-paths-'));
  await fs.mkdir(path.join(dir, 'lib'), { recursive: true });
  await fs.writeFile(path.join(dir, 'lib', 'extra-indexer.mjs'), INDEXER);
  await fs.writeFile(path.join(dir, 'lib', 'provider.mjs'), PROVIDER);
  await fs.writeFile(path.join(dir, 'lib', 'ranker.mjs'), RANKER);
  vi.spyOn(console, 'log').mockImplementation(() => {});
});

afterEach(() => {
  vi.mocked(process.cwd).mockRestore?.();
});

afterAll(async () => {
  vi.restoreAllMocks();
  await fs.rm(dir, { recursive: true, force: true });
});

const inProject = () => vi.spyOn(process, 'cwd').mockReturnValue(dir);

describe('loadIndexer', () => {
  it('resolves ./ and ../ paths against baseDir', async () => {
    expect((await loadIndexer('./lib/extra-indexer.mjs', { baseDir: dir })).name).toBe('extra');
    expect(
      (await loadIndexer('../lib/extra-indexer.mjs', { baseDir: path.join(dir, 'lib') })).name
    ).toBe('extra');
  });

  it('resolves against the working directory by default, and loads absolute paths', async () => {
    inProject();
    expect((await loadIndexer('./lib/extra-indexer.mjs')).name).toBe('extra');
    expect((await loadIndexer(path.join(dir, 'lib', 'extra-indexer.mjs'))).name).toBe('extra');
  });

  it('still reports a missing path', async () => {
    await expect(loadIndexer('./lib/nope.mjs', { baseDir: dir })).rejects.toThrow(
      'Indexer module not found: "./lib/nope.mjs"'
    );
  });
});

describe('loadSearchProvider and the server', () => {
  it('loadSearchProvider resolves a relative path against the working directory', async () => {
    inProject();
    expect((await loadSearchProvider('./lib/provider.mjs')).name).toBe('full');
    await expect(loadSearchProvider('./lib/nope.mjs')).rejects.toThrow(
      'Search provider module not found: "./lib/nope.mjs"'
    );
  });

  it('the server loads a relative search path from the working directory', async () => {
    inProject();
    const server = new McpDocsServer({
      artifacts: await buildTestBundle([
        { route: '/a', title: 'A', description: '', markdown: '# A\n\nBody.', headings: [] },
      ]),
      search: './lib/ranker.mjs',
    });
    await server.initialize();
    expect((await server.getStatus()).searchProvider).toBe('ranker');
  });
});

describe('the plugin', () => {
  it('resolves an indexer path against the site directory', async () => {
    const siteDir = dir;
    const outDir = path.join(siteDir, 'build');
    await fs.mkdir(path.join(outDir, 'docs'), { recursive: true });
    await fs.writeFile(
      path.join(outDir, 'docs', 'index.html'),
      `<html><body><article><h1>Docs</h1><p>${'Enough content to keep. '.repeat(5)}</p></article></body></html>`
    );
    // The working directory is elsewhere, as when building from a monorepo root.
    vi.spyOn(process, 'cwd').mockReturnValue(os.tmpdir());

    const plugin = mcpServerPlugin(
      {
        siteDir,
        siteConfig: { url: 'https://docs.example.com', baseUrl: '/', title: 'Docs' },
      } as unknown as LoadContext,
      { skills: false, indexers: ['local', './lib/extra-indexer.mjs'] }
    ) as Plugin & { postBuild: (props: { outDir: string }) => Promise<void> };
    await plugin.postBuild({ outDir } as never);

    const bundle = JSON.parse(await fs.readFile(path.join(outDir, 'mcp', 'bundle.json'), 'utf8'));
    expect(bundle.extras?.['extra.json']).toEqual({ count: 1 });
  });
});
