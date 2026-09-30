/**
 * The file (`docsPath`/`indexPath`) and pre-loaded data (`docs`/`searchIndexData`)
 * server configs are deprecated in 2.2 and removed in 3.0. Until then they
 * must behave exactly as in 2.1. This is the only file that uses them.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { McpDocsServer } from '../src/mcp/server.js';
import { createWebRequestHandler } from '../src/adapters/web-request.js';
import { createNodeHandler } from '../src/adapters/node.js';
import { ConfigurationError } from '../src/errors.js';
import { buildSkillsArtifact } from '../src/skills/packager.js';
import type { ArtifactBundle } from '../src/artifacts/bundle.js';
import type {
  McpServerDataConfig,
  McpServerFileConfig,
  ProcessedDoc,
  SkillsArtifact,
} from '../src/types/index.js';
import type { SearchProvider, SearchProviderInitData } from '../src/providers/types.js';
import { buildTestBundle } from './helpers/bundle.js';

const docs: ProcessedDoc[] = [
  {
    route: '/docs/install',
    title: 'Installation',
    description: 'Install it',
    markdown: '# Installation\n\nRun npm install widget.',
    headings: [],
  },
];

const MCP_HEADERS = {
  'Content-Type': 'application/json',
  Accept: 'application/json, text/event-stream',
};

async function call(server: McpDocsServer, method: string, params: Record<string, unknown>) {
  const response = await server.handleWebRequest(
    new Request('https://localhost/mcp', {
      method: 'POST',
      headers: MCP_HEADERS,
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    })
  );
  return ((await response.json()) as { result: Record<string, unknown> }).result;
}

const searchText = async (server: McpDocsServer) => {
  const result = await call(server, 'tools/call', {
    name: 'docs_search',
    arguments: { query: 'install' },
  });
  return (result.content as Array<{ text: string }>)[0]?.text;
};

function recordingProvider() {
  const seen: { initData?: SearchProviderInitData } = {};
  const provider: SearchProvider = {
    name: 'recording',
    initialize: async (_context, initData) => {
      seen.initData = initData;
    },
    isReady: () => true,
    search: async () => [],
  };
  return { provider, seen };
}

let bundle: ArtifactBundle;
let skills: SkillsArtifact;
let dir: string;
let fileConfig: McpServerFileConfig;
let dataConfig: McpServerDataConfig;

beforeAll(async () => {
  skills = await buildSkillsArtifact({ builtin: true, siteTitle: 'Widget Docs' });
  bundle = await buildTestBundle(docs, { name: 'from-bundle', baseUrl: 'https://example.com' });

  dir = await fs.mkdtemp(path.join(os.tmpdir(), 'mcp-legacy-'));
  await fs.writeFile(path.join(dir, 'docs.json'), JSON.stringify(bundle.docs));
  await fs.writeFile(path.join(dir, 'search-index.json'), JSON.stringify(bundle.searchIndex));
  await fs.writeFile(path.join(dir, 'skills.json'), JSON.stringify(skills));

  fileConfig = {
    name: 'legacy-docs',
    baseUrl: 'https://example.com',
    docsPath: path.join(dir, 'docs.json'),
    indexPath: path.join(dir, 'search-index.json'),
    skillsPath: path.join(dir, 'skills.json'),
  };
  dataConfig = {
    name: 'legacy-docs',
    baseUrl: 'https://example.com',
    docs: bundle.docs,
    searchIndexData: bundle.searchIndex as Record<string, unknown>,
    skills,
  };
});

afterAll(async () => {
  await fs.rm(dir, { recursive: true, force: true });
});

describe.each([
  ['file', () => fileConfig],
  ['pre-loaded data', () => dataConfig],
] as const)('deprecated %s config', (_label, config) => {
  it('serves the same search results as the artifact bundle', async () => {
    const legacy = new McpDocsServer(config());
    const modern = new McpDocsServer({ artifacts: bundle });
    expect(await searchText(legacy)).toBe(await searchText(modern));
  });

  it('reports name and baseUrl from config, and version 1.0.0 by default', async () => {
    const server = new McpDocsServer(config());
    await server.initialize();
    expect(await server.getStatus()).toMatchObject({
      name: 'legacy-docs',
      version: '1.0.0',
      baseUrl: 'https://example.com',
      docCount: 1,
      skillCount: 1,
    });
  });

  it('still serves docs_fetch', async () => {
    const server = new McpDocsServer(config());
    const result = await call(server, 'tools/call', {
      name: 'docs_fetch',
      arguments: { url: 'https://example.com/docs/install' },
    });
    expect((result.content as Array<{ text: string }>)[0]?.text).toContain('Run npm install');
  });
});

describe('deprecated file config specifics', () => {
  it('still gives custom providers the file paths, alongside the bundle', async () => {
    const { provider, seen } = recordingProvider();
    await new McpDocsServer({ ...fileConfig, search: provider }).initialize();

    expect(seen.initData?.docsPath).toBe(fileConfig.docsPath);
    expect(seen.initData?.indexPath).toBe(fileConfig.indexPath);
    expect(seen.initData?.bundle?.docs).toEqual(bundle.docs);
    expect(seen.initData?.docs).toEqual(bundle.docs);
  });

  it.each([
    [
      'docsPath',
      'docs.json',
      /docs\.json not found or unreadable: .*nope\.json\. Build the site first\./,
    ],
    [
      'indexPath',
      'search-index.json',
      /search-index\.json not found or unreadable: .*nope\.json\. Build the site first\./,
    ],
    [
      'skillsPath',
      'skills.json',
      /skills\.json not found or unreadable: .*nope\.json\. Build the site first, or remove skillsPath\./,
    ],
  ])('names a missing %s', async (key, _file, message) => {
    const server = new McpDocsServer({ ...fileConfig, [key]: path.join(dir, 'nope.json') });
    const error = await server.initialize().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ConfigurationError);
    expect((error as Error).message).toMatch(message);
  });
});

describe('deprecated configs with a custom search provider (2.1 parity)', () => {
  // A site with only custom indexers has no docs.json or search-index.json
  // from 2.1, and its provider ignores the paths. That must keep working.
  it('initializes a file config whose files do not exist, passing the paths', async () => {
    const { provider, seen } = recordingProvider();
    const server = new McpDocsServer({
      name: 'custom',
      docsPath: path.join(dir, 'missing-docs.json'),
      indexPath: path.join(dir, 'missing-index.json'),
      search: provider,
    });

    await expect(server.initialize()).resolves.toBeUndefined();
    expect(seen.initData?.docsPath).toBe(path.join(dir, 'missing-docs.json'));
    expect(seen.initData?.indexPath).toBe(path.join(dir, 'missing-index.json'));
    expect(seen.initData?.bundle?.docs).toEqual({});
    expect(seen.initData?.bundle).not.toHaveProperty('searchIndex');
    expect((await server.getStatus()).docCount).toBe(0);
  });

  it('initializes a data config without usable docs or index', async () => {
    const { provider } = recordingProvider();
    const server = new McpDocsServer({
      name: 'custom',
      docs: null as never,
      searchIndexData: undefined as never,
      search: provider,
    });
    await expect(server.initialize()).resolves.toBeUndefined();
  });
});

describe('deprecated configs: 2.1 errors and their order', () => {
  it('reports a bad search module before missing files', async () => {
    const server = new McpDocsServer({
      name: 'x',
      docsPath: path.join(dir, 'nope.json'),
      indexPath: path.join(dir, 'nope.json'),
      search: './no-such-provider.js',
    });
    await expect(server.initialize()).rejects.toThrow(/Search provider module not found/);
  });

  it('reports missing skills before missing docs', async () => {
    const server = new McpDocsServer({
      name: 'x',
      docsPath: path.join(dir, 'nope-docs.json'),
      indexPath: path.join(dir, 'nope-index.json'),
      skillsPath: path.join(dir, 'nope-skills.json'),
    });
    await expect(server.initialize()).rejects.toThrow(/skills\.json not found/);
  });

  it.each([
    ['docs is null', { docs: null, searchIndexData: {} }],
    ['searchIndexData is undefined', { docs: {}, searchIndexData: undefined }],
  ])('local search with a data config where %s throws the 2.1 error', async (_label, data) => {
    const server = new McpDocsServer({ name: 'x', ...data } as never);
    await expect(server.initialize()).rejects.toThrow(
      '[LocalSearch] Invalid init data: must provide either file paths'
    );
  });

  it('local search still reports a stale 1.x index file with the rebuild instruction', async () => {
    const stale = path.join(dir, 'stale-index.json');
    await fs.writeFile(stale, JSON.stringify({ reg: '{}', 'content.map': '[]' }));
    const server = new McpDocsServer({ ...fileConfig, indexPath: stale });
    await expect(server.initialize()).rejects.toThrow(/Rebuild the site/);
  });
});

describe('deprecated configs through the adapters', () => {
  it('createWebRequestHandler accepts pre-loaded data', async () => {
    const handler = createWebRequestHandler(dataConfig);
    const res = await handler(new Request('https://x/mcp', { method: 'GET' }));
    expect(await res.json()).toMatchObject({ name: 'legacy-docs', docCount: 1 });
  });

  it('createNodeHandler accepts file paths', async () => {
    const handler = createNodeHandler(fileConfig);
    let body = '';
    let status = 0;
    await handler(
      { method: 'GET' } as never,
      {
        setHeader: () => {},
        writeHead: (code: number) => {
          status = code;
        },
        end: (chunk: string) => {
          body = chunk;
        },
      } as never
    );
    expect(status).toBe(200);
    expect(JSON.parse(body)).toMatchObject({ name: 'legacy-docs', docCount: 1 });
  });
});
