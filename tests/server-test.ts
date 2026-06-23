import { describe, it, expect, beforeEach } from 'vitest';
import { McpDocsServer } from '../src/mcp/server.js';
import { FlexSearchIndexer } from '../src/providers/indexers/flexsearch-indexer.js';
import type { ProcessedDoc, McpServerDataConfig, McpServerFileConfig } from '../src/types/index.js';
import type { ProviderContext } from '../src/providers/types.js';

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

const mockProviderContext: ProviderContext = {
  baseUrl: 'https://example.com',
  serverName: 'test-server',
  serverVersion: '1.0.0',
  outputDir: '/tmp/test',
};

async function buildArtifacts() {
  const indexer = new FlexSearchIndexer();
  await indexer.initialize(mockProviderContext);
  await indexer.indexDocuments(mockDocs);
  return indexer.finalize();
}

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

describe('McpDocsServer', () => {
  let artifacts: Map<string, unknown>;
  let dataConfig: McpServerDataConfig;

  beforeEach(async () => {
    artifacts = await buildArtifacts();
    dataConfig = {
      name: 'test-docs',
      version: '2.0.0',
      baseUrl: 'https://example.com',
      docs: artifacts.get('docs.json') as Record<string, ProcessedDoc>,
      searchIndexData: artifacts.get('search-index.json') as Record<string, unknown>,
    };
  });

  describe('constructor', () => {
    it('creates a server with data-based config', () => {
      const server = new McpDocsServer(dataConfig);
      expect(server).toBeInstanceOf(McpDocsServer);
    });

    it('creates a server with file-based config', () => {
      const fileConfig: McpServerFileConfig = {
        name: 'file-docs',
        version: '1.0.0',
        docsPath: '/tmp/docs.json',
        indexPath: '/tmp/search-index.json',
      };
      const server = new McpDocsServer(fileConfig);
      expect(server).toBeInstanceOf(McpDocsServer);
    });
  });

  describe('initialize()', () => {
    it('initializes successfully with pre-loaded data', async () => {
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
      expect(status.searchProvider).toBe('flexsearch');
    });

    it('returns defaults when version is omitted', async () => {
      const config: McpServerDataConfig = {
        ...dataConfig,
        version: undefined,
      };
      const server = new McpDocsServer(config);
      await server.initialize();

      const status = await server.getStatus();
      expect(status.version).toBe('1.0.0');
    });

    it('returns initialized false and docCount 0 before init', async () => {
      const server = new McpDocsServer(dataConfig);
      const status = await server.getStatus();

      expect(status.initialized).toBe(false);
      expect(status.docCount).toBe(0);
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
    it('rejects on invalid config (neither file paths nor pre-loaded data)', async () => {
      const server = new McpDocsServer({ name: 'bad' } as unknown as McpServerDataConfig);
      await expect(server.initialize()).rejects.toThrow(/Invalid server config/);
    });

    it('caches the init error — a second initialize() also rejects (fail-fast)', async () => {
      const server = new McpDocsServer({
        name: 'missing-files',
        docsPath: '/no/such/docs.json',
        indexPath: '/no/such/search-index.json',
      });
      await expect(server.initialize()).rejects.toThrow();
      await expect(server.initialize()).rejects.toThrow();
    });
  });
});
