import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import type { LoadContext, Plugin } from '@docusaurus/types';
import mcpServerPlugin from '../src/plugin/docusaurus-plugin.js';
import type { McpServerPluginOptions } from '../src/types/index.js';
import { parseVerifyArgs, testServer, verifyBuild } from '../src/cli/verify-build.js';

const PAGE = `<!doctype html><html><head><title>Intro | Example</title></head>
<body><article><h1>Intro</h1><p>${'Welcome to the example documentation. '.repeat(5)}</p></article></body></html>`;

// Indexer and server progress logs are expected here; keep test output readable.
beforeAll(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
});
afterAll(() => {
  vi.restoreAllMocks();
});

describe('docusaurus-mcp-verify against real plugin output', () => {
  let siteDir: string;
  let buildDir: string;

  beforeEach(async () => {
    siteDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mcp-verify-'));
    buildDir = path.join(siteDir, 'build');
    await fs.mkdir(path.join(buildDir, 'docs', 'intro'), { recursive: true });
    await fs.writeFile(path.join(buildDir, 'docs', 'intro', 'index.html'), PAGE);
  });

  afterEach(async () => {
    await fs.rm(siteDir, { recursive: true, force: true });
  });

  async function runBuild(options: McpServerPluginOptions) {
    const context = {
      siteDir,
      siteConfig: { url: 'https://docs.example.com', baseUrl: '/', title: 'Example Docs' },
    } as unknown as LoadContext;
    const plugin = mcpServerPlugin(context, options) as Plugin & {
      postBuild: (props: { outDir: string }) => Promise<void>;
    };
    await plugin.postBuild({ outDir: buildDir });
  }

  it('passes with no warnings on default output', async () => {
    await runBuild({ server: { name: 'example-docs', version: '3.1.4' }, skills: false });

    const result = await verifyBuild({ buildDir });

    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual([]);
    expect(result.success).toBe(true);
    expect(result.docsFound).toBe(1);
  });

  it('starts the server with the name from the manifest', async () => {
    await runBuild({ server: { name: 'example-docs', version: '3.1.4' }, skills: false });

    const result = await testServer({ buildDir });

    expect(result.success).toBe(true);
    expect(result.message).toContain('"example-docs"');
    expect(result.message).toContain('1 documents');
  });

  it('reads a custom outputDir when given the same value', async () => {
    await runBuild({ outputDir: 'agents/mcp', skills: false });

    const result = await verifyBuild({ buildDir, outputDir: 'agents/mcp' });
    expect(result.success).toBe(true);
    expect(result.warnings).toEqual([]);

    const server = await testServer({ buildDir, outputDir: 'agents/mcp' });
    expect(server.success).toBe(true);
  });

  it('accepts a 2.0/2.1 per-file build, with a warning to rebuild', async () => {
    await runBuild({ skills: false });
    await fs.rm(path.join(buildDir, 'mcp', 'bundle.json'));

    const result = await verifyBuild({ buildDir });
    expect(result.success).toBe(true);
    expect(result.warnings).toEqual([expect.stringMatching(/bundle.json not found.*predates/)]);
    expect((await testServer({ buildDir })).success).toBe(true);
  });

  it('fails a build without a search index', async () => {
    const custom = path.join(siteDir, 'algolia.mjs');
    await fs.writeFile(
      custom,
      'export default class { name = "algolia"; async initialize() {} async indexDocuments() {} async finalize() { return new Map(); } }'
    );
    await runBuild({ indexers: [pathToFileURL(custom).href], skills: false });

    const result = await verifyBuild({ buildDir });
    expect(result.success).toBe(false);
    expect(result.errors.join('\n')).toMatch(/no search index/);
  });

  it('reports a corrupt bundle with the reason', async () => {
    await runBuild({ skills: false });
    await fs.writeFile(path.join(buildDir, 'mcp', 'bundle.json'), '{"formatVersion": 99}');

    const result = await verifyBuild({ buildDir });
    expect(result.success).toBe(false);
    expect(result.errors.join('\n')).toMatch(/formatVersion 99.*Upgrade/);
  });

  it('points at --output-dir when the default directory is missing', async () => {
    await runBuild({ outputDir: 'agents/mcp', skills: false });

    const result = await verifyBuild({ buildDir });

    expect(result.success).toBe(false);
    expect(result.errors.join('\n')).toContain('--output-dir');
  });
});

describe('parseVerifyArgs', () => {
  it('defaults to ./build and mcp', () => {
    expect(parseVerifyArgs([])).toEqual({ help: false, buildDir: './build', outputDir: 'mcp' });
  });

  it('accepts a build dir and --output-dir in either form', () => {
    expect(parseVerifyArgs(['site/build', '--output-dir', 'x'])).toEqual({
      help: false,
      buildDir: 'site/build',
      outputDir: 'x',
    });
    expect(parseVerifyArgs(['--output-dir=y'])).toMatchObject({ outputDir: 'y' });
  });

  it('returns help for -h and --help', () => {
    expect(parseVerifyArgs(['-h'])).toEqual({ help: true });
    expect(parseVerifyArgs(['--help'])).toEqual({ help: true });
  });

  it('rejects unknown flags and extra positionals', () => {
    expect(() => parseVerifyArgs(['--outdir', 'x'])).toThrow();
    expect(() => parseVerifyArgs(['a', 'b'])).toThrow(/at most one build directory/);
  });
});
