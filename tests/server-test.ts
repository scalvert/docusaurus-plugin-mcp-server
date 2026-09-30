import { describe, it, expect, beforeEach } from 'vitest';
import { McpDocsServer } from '../src/mcp/server.js';
import { ConfigurationError } from '../src/errors.js';
import type { ArtifactBundle } from '../src/artifacts/bundle.js';
import type { ProcessedDoc, McpServerBundleConfig } from '../src/types/index.js';
import type { SearchProvider, SearchProviderInitData } from '../src/providers/types.js';
import { buildTestBundle } from './helpers/bundle.js';

const mockDocs: ProcessedDoc[] = [
  {
    route: '/docs/getting-started',
    title: 'Getting Started',
    description: 'Learn how to get started',
    markdown: '# Getting Started\n\nWelcome to the docs.',
    headings: [
      { level: 1, text: 'Getting Started', id: 'getting-started', startOffset: 0, endOffset: 40 },
    ],
  },
  {
    route: '/docs/api',
    title: 'API Reference',
    description: 'API docs',
    markdown: '# API Reference\n\nEndpoints listed here.',
    headings: [
      { level: 1, text: 'API Reference', id: 'api-reference', startOffset: 0, endOffset: 38 },
    ],
  },
];

/**
 * Send a JSON-RPC request through the server's public Web Standard path
 * and return the parsed JSON-RPC result.
 */
async function callMcp(
  server: McpDocsServer,
  method: string,
  params: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const request = new Request('https://localhost/mcp', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
    },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  });

  const response = await server.handleWebRequest(request);
  const body = (await response.json()) as { result?: Record<string, unknown> };
  return body.result ?? {};
}

const initializeParams = {
  protocolVersion: '2025-06-18',
  capabilities: {},
  clientInfo: { name: 'test-client', version: '1.0.0' },
};

/** A search provider with none of the optional methods, recording what it was given. */
function bareProvider(): SearchProvider & { initData?: SearchProviderInitData } {
  const provider: SearchProvider & { initData?: SearchProviderInitData } = {
    name: 'bare',
    initialize: async (_context, initData) => {
      provider.initData = initData;
    },
    isReady: () => true,
    search: async () => [],
  };
  return provider;
}

describe('McpDocsServer', () => {
  let bundle: ArtifactBundle;
  let dataConfig: McpServerBundleConfig;

  beforeEach(async () => {
    bundle = await buildTestBundle(mockDocs, {
      name: 'test-docs',
      version: '2.0.0',
      baseUrl: 'https://example.com',
    });
    // Name, version, and base URL come from the bundle's manifest.
    dataConfig = { artifacts: bundle };
  });

  describe('constructor', () => {
    it('creates a server from an artifact bundle', () => {
      const server = new McpDocsServer(dataConfig);
      expect(server).toBeInstanceOf(McpDocsServer);
    });
  });

  describe('initialize()', () => {
    it('initializes successfully from an artifact bundle', async () => {
      const server = new McpDocsServer(dataConfig);
      await expect(server.initialize()).resolves.not.toThrow();
    });

    it('is idempotent — second call returns immediately', async () => {
      const server = new McpDocsServer(dataConfig);
      await server.initialize();
      // Second call should resolve without error
      await expect(server.initialize()).resolves.not.toThrow();
    });
  });

  describe('getStatus()', () => {
    it('returns correct status after initialization', async () => {
      const server = new McpDocsServer(dataConfig);
      await server.initialize();

      const status = await server.getStatus();
      expect(status.name).toBe('test-docs');
      expect(status.version).toBe('2.0.0');
      expect(status.initialized).toBe(true);
      expect(status.docCount).toBe(2);
      expect(status.baseUrl).toBe('https://example.com');
      expect(status.searchProvider).toBe('local');
    });

    it('prefers name, version, and baseUrl from config over the manifest', async () => {
      const server = new McpDocsServer({
        ...dataConfig,
        name: 'renamed',
        version: '9.9.9',
        baseUrl: 'https://mirror.example.com',
      });
      await server.initialize();

      const status = await server.getStatus();
      expect(status).toMatchObject({
        name: 'renamed',
        version: '9.9.9',
        baseUrl: 'https://mirror.example.com',
      });

      const result = await callMcp(server, 'initialize', initializeParams);
      expect(result.serverInfo).toMatchObject({ name: 'renamed', version: '9.9.9' });
    });

    it('reports the manifest name in serverInfo when config has none', async () => {
      const server = new McpDocsServer(dataConfig);
      const result = await callMcp(server, 'initialize', initializeParams);
      expect(result.serverInfo).toMatchObject({ name: 'test-docs', version: '2.0.0' });
    });

    it('returns initialized false and docCount 0 before init', async () => {
      const server = new McpDocsServer(dataConfig);
      const status = await server.getStatus();

      expect(status.initialized).toBe(false);
      expect(status.docCount).toBe(0);
    });

    it('counts the bundle documents when the provider has no getDocCount', async () => {
      const server = new McpDocsServer({ ...dataConfig, search: bareProvider() });
      await server.initialize();
      expect((await server.getStatus()).docCount).toBe(2);
    });
  });

  describe('search providers', () => {
    it('receives the bundle, with the deprecated fields still populated', async () => {
      const provider = bareProvider();
      const withExtras = { ...bundle, extras: { 'custom.json': { a: 1 } } };
      const server = new McpDocsServer({ artifacts: withExtras, search: provider });
      await server.initialize();

      expect(provider.initData?.bundle).toBe(withExtras);
      expect(provider.initData?.bundle?.extras).toEqual({ 'custom.json': { a: 1 } });
      expect(provider.initData?.docs).toBe(bundle.docs);
      expect(provider.initData?.indexData).toBe(bundle.searchIndex);
      expect(provider.initData).not.toHaveProperty('docsPath');
    });

    it('docs_fetch reads the bundle when the provider has no getDocument', async () => {
      const server = new McpDocsServer({ ...dataConfig, search: bareProvider() });

      const result = await callMcp(server, 'tools/call', {
        name: 'docs_fetch',
        arguments: { url: 'https://example.com/docs/api' },
      });
      const text = (result.content as Array<{ text: string }>)[0]?.text ?? '';

      expect(result.isError).toBeFalsy();
      expect(text).toContain('Endpoints listed here.');
    });
  });

  describe('instructions', () => {
    it('surfaces configured instructions in the initialize result', async () => {
      const server = new McpDocsServer({
        ...dataConfig,
        instructions: 'Use docs_search first, then docs_fetch for full content.',
      });

      const result = await callMcp(server, 'initialize', initializeParams);

      expect(result.instructions).toBe('Use docs_search first, then docs_fetch for full content.');
    });

    it('omits instructions when not configured', async () => {
      const server = new McpDocsServer(dataConfig);

      const result = await callMcp(server, 'initialize', initializeParams);

      expect(result.instructions).toBeUndefined();
    });
  });

  describe('tool description overrides', () => {
    it('applies custom descriptions to both tools', async () => {
      const server = new McpDocsServer({
        ...dataConfig,
        tools: {
          docs_search: { description: 'Custom search description' },
          docs_fetch: { description: 'Custom fetch description' },
        },
      });

      const result = await callMcp(server, 'tools/list', {});
      const tools = result.tools as Array<{ name: string; description: string }>;

      const search = tools.find((t) => t.name === 'docs_search');
      const fetch = tools.find((t) => t.name === 'docs_fetch');

      expect(search?.description).toBe('Custom search description');
      expect(fetch?.description).toBe('Custom fetch description');
    });

    it('falls back to default descriptions when not overridden', async () => {
      const server = new McpDocsServer(dataConfig);

      const result = await callMcp(server, 'tools/list', {});
      const tools = result.tools as Array<{ name: string; description: string }>;

      const search = tools.find((t) => t.name === 'docs_search');
      const fetch = tools.find((t) => t.name === 'docs_fetch');

      expect(search?.description).toContain('Search the documentation');
      expect(fetch?.description).toContain('Fetch the complete content');
    });

    it('overrides only the specified tool, leaving the other default', async () => {
      const server = new McpDocsServer({
        ...dataConfig,
        tools: {
          docs_search: { description: 'Only search is custom' },
        },
      });

      const result = await callMcp(server, 'tools/list', {});
      const tools = result.tools as Array<{ name: string; description: string }>;

      const search = tools.find((t) => t.name === 'docs_search');
      const fetch = tools.find((t) => t.name === 'docs_fetch');

      expect(search?.description).toBe('Only search is custom');
      expect(fetch?.description).toContain('Fetch the complete content');
    });
  });

  describe('initialize() error handling', () => {
    it('rejects on invalid config (no artifacts, file paths, or pre-loaded data)', async () => {
      const server = new McpDocsServer({ name: 'bad' } as unknown as McpServerBundleConfig);
      await expect(server.initialize()).rejects.toThrow(/Invalid server config: pass artifacts/);
    });

    it('rejects artifacts that are not a bundle, saying what to pass', async () => {
      // A common mistake: passing docs.json instead of bundle.json.
      const server = new McpDocsServer({ artifacts: bundle.docs });
      const error = await server.initialize().catch((e: unknown) => e);

      expect(error).toBeInstanceOf(ConfigurationError);
      expect((error as Error).message).toMatch(
        /artifacts option \(expected the contents of build\/mcp\/bundle.json\).*missing formatVersion/
      );
    });

    it('explains a bundle built without the local indexer', async () => {
      const { searchIndex: _searchIndex, ...withoutIndex } = bundle;
      const server = new McpDocsServer({ artifacts: withoutIndex });
      await expect(server.initialize()).rejects.toThrow(/has no search index.*'local'/);
    });

    it('caches the init error — a second initialize() also rejects (fail-fast)', async () => {
      const server = new McpDocsServer({ artifacts: {} });
      await expect(server.initialize()).rejects.toThrow(ConfigurationError);
      await expect(server.initialize()).rejects.toThrow(ConfigurationError);
    });
  });
});
