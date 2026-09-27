import { describe, it, expect, beforeEach } from 'vitest';
import { LocalSearchIndexer } from '../src/providers/indexers/local-search-indexer.js';
import { LocalSearchProvider } from '../src/providers/search/local-search-provider.js';
import { loadIndexer, loadSearchProvider } from '../src/providers/loader.js';
import type { ProcessedDoc } from '../src/types/index.js';
import type { ProviderContext } from '../src/providers/types.js';

// Mock docs for testing
const mockDocs: ProcessedDoc[] = [
  {
    route: '/docs/getting-started',
    title: 'Getting Started',
    description: 'Learn how to get started with our product',
    markdown:
      '# Getting Started\n\nWelcome to our product. This guide will help you get started.\n\n## Installation\n\nRun `npm install` to install dependencies.',
    headings: [
      { level: 1, text: 'Getting Started', id: 'getting-started', startOffset: 0, endOffset: 18 },
      { level: 2, text: 'Installation', id: 'installation', startOffset: 80, endOffset: 156 },
    ],
  },
  {
    route: '/docs/api-reference',
    title: 'API Reference',
    description: 'Complete API documentation',
    markdown:
      '# API Reference\n\nThis is the API reference documentation.\n\n## Authentication\n\nAll API requests require authentication.',
    headings: [
      { level: 1, text: 'API Reference', id: 'api-reference', startOffset: 0, endOffset: 15 },
      { level: 2, text: 'Authentication', id: 'authentication', startOffset: 60, endOffset: 130 },
    ],
  },
];

const mockProviderContext: ProviderContext = {
  baseUrl: 'https://docs.example.com',
  serverName: 'test-server',
  serverVersion: '1.0.0',
  outputDir: '/tmp/test-output',
};

describe('LocalSearchIndexer', () => {
  let indexer: LocalSearchIndexer;

  beforeEach(() => {
    indexer = new LocalSearchIndexer();
  });

  it('should have correct name', () => {
    expect(indexer.name).toBe('local');
  });

  it('shouldRun returns true by default', () => {
    expect(indexer.shouldRun()).toBe(true);
  });

  it('should initialize without error', async () => {
    await expect(indexer.initialize(mockProviderContext)).resolves.not.toThrow();
  });

  it('should index documents', async () => {
    await indexer.initialize(mockProviderContext);
    await expect(indexer.indexDocuments(mockDocs)).resolves.not.toThrow();
  });

  it('should produce docs.json and search-index.json artifacts', async () => {
    await indexer.initialize(mockProviderContext);
    await indexer.indexDocuments(mockDocs);
    const artifacts = await indexer.finalize();

    expect(artifacts.has('docs.json')).toBe(true);
    expect(artifacts.has('search-index.json')).toBe(true);

    // Check docs.json structure - docs are keyed by full URL
    const docsJson = artifacts.get('docs.json') as Record<string, ProcessedDoc>;
    expect(docsJson['https://docs.example.com/docs/getting-started']).toBeDefined();
    expect(docsJson['https://docs.example.com/docs/api-reference']).toBeDefined();
    const gettingStartedDoc = docsJson['https://docs.example.com/docs/getting-started'];
    expect(gettingStartedDoc?.title).toBe('Getting Started');
  });

  it('should return manifest data', async () => {
    await indexer.initialize(mockProviderContext);
    await indexer.indexDocuments(mockDocs);
    const manifestData = await indexer.getManifestData!();

    expect(manifestData.searchEngine).toBe('local');
  });
});

describe('LocalSearchProvider', () => {
  let provider: LocalSearchProvider;
  let indexer: LocalSearchIndexer;
  let artifacts: Map<string, unknown>;

  beforeEach(async () => {
    // First, create artifacts using the indexer
    indexer = new LocalSearchIndexer();
    await indexer.initialize(mockProviderContext);
    await indexer.indexDocuments(mockDocs);
    artifacts = await indexer.finalize();

    provider = new LocalSearchProvider();
  });

  it('should have correct name', () => {
    expect(provider.name).toBe('local');
  });

  it('should not be ready before initialization', () => {
    expect(provider.isReady()).toBe(false);
  });

  it('should initialize with pre-loaded data', async () => {
    await provider.initialize(mockProviderContext, {
      docs: artifacts.get('docs.json') as Record<string, ProcessedDoc>,
      indexData: artifacts.get('search-index.json') as Record<string, unknown>,
    });

    expect(provider.isReady()).toBe(true);
  });

  it('should search documents', async () => {
    await provider.initialize(mockProviderContext, {
      docs: artifacts.get('docs.json') as Record<string, ProcessedDoc>,
      indexData: artifacts.get('search-index.json') as Record<string, unknown>,
    });

    const results = await provider.search('getting started');
    expect(results.length).toBeGreaterThan(0);
    expect(results[0]?.title).toBe('Getting Started');
  });

  it('should search with limit option', async () => {
    await provider.initialize(mockProviderContext, {
      docs: artifacts.get('docs.json') as Record<string, ProcessedDoc>,
      indexData: artifacts.get('search-index.json') as Record<string, unknown>,
    });

    const results = await provider.search('documentation', { limit: 1 });
    expect(results.length).toBeLessThanOrEqual(1);
  });

  it('should get document by URL', async () => {
    await provider.initialize(mockProviderContext, {
      docs: artifacts.get('docs.json') as Record<string, ProcessedDoc>,
      indexData: artifacts.get('search-index.json') as Record<string, unknown>,
    });

    const doc = await provider.getDocument('https://docs.example.com/docs/getting-started');
    expect(doc).toBeDefined();
    expect(doc?.title).toBe('Getting Started');
  });

  it('should return null for non-existent document', async () => {
    await provider.initialize(mockProviderContext, {
      docs: artifacts.get('docs.json') as Record<string, ProcessedDoc>,
      indexData: artifacts.get('search-index.json') as Record<string, unknown>,
    });

    const doc = await provider.getDocument('https://docs.example.com/docs/non-existent');
    expect(doc).toBeNull();
  });

  it('should return healthy status', async () => {
    await provider.initialize(mockProviderContext, {
      docs: artifacts.get('docs.json') as Record<string, ProcessedDoc>,
      indexData: artifacts.get('search-index.json') as Record<string, unknown>,
    });

    const health = await provider.healthCheck!();
    expect(health.healthy).toBe(true);
    expect(health.message).toContain('2 documents');
  });

  it('should throw error when not initialized', async () => {
    await expect(provider.search('test')).rejects.toThrow('not initialized');
  });

  it('rejects a 1.x FlexSearch index with a rebuild message', async () => {
    await expect(
      provider.initialize(mockProviderContext, {
        docs: artifacts.get('docs.json') as Record<string, ProcessedDoc>,
        // The shape FlexSearch exported in 1.x
        indexData: { reg: '{}', 'content.map': '[]' },
      })
    ).rejects.toThrow(/Rebuild the site/);
  });

  it('applies runtime field boosts', async () => {
    const init = {
      docs: artifacts.get('docs.json') as Record<string, ProcessedDoc>,
      indexData: artifacts.get('search-index.json') as Record<string, unknown>,
    };
    // "authentication" is the API Reference page's heading and the Getting
    // Started page's body text; boosting headings vs content flips the order.
    const byHeadings = new LocalSearchProvider({ fieldBoosts: { headings: 10, content: 0.1 } });
    await byHeadings.initialize(mockProviderContext, init);
    expect((await byHeadings.search('authentication'))[0]?.title).toBe('API Reference');
  });
});

describe('Provider Loader', () => {
  describe('loadIndexer', () => {
    it('should load built-in local indexer', async () => {
      const indexer = await loadIndexer('local');
      expect(indexer.name).toBe('local');
      expect(indexer instanceof LocalSearchIndexer).toBe(true);
    });

    it('should throw error for non-existent module', async () => {
      await expect(loadIndexer('./non-existent-module.js')).rejects.toThrow();
    });

    it("rejects the removed 1.x 'flexsearch' indexer with a migration pointer", async () => {
      await expect(loadIndexer('flexsearch')).rejects.toThrow(/Upgrading to 2\.0/);
    });
  });

  describe('loadSearchProvider', () => {
    it('should load built-in local provider', async () => {
      const provider = await loadSearchProvider('local');
      expect(provider.name).toBe('local');
      expect(provider instanceof LocalSearchProvider).toBe(true);
    });

    it("rejects the removed 1.x 'flexsearch' provider with a migration pointer", async () => {
      await expect(loadSearchProvider('flexsearch')).rejects.toThrow(/Upgrading to 2\.0/);
    });

    it('should throw error for non-existent module', async () => {
      await expect(loadSearchProvider('./non-existent-module.js')).rejects.toThrow();
    });

    it('returns a SearchProvider instance passed directly', async () => {
      const instance = new LocalSearchProvider();
      const loaded = await loadSearchProvider(instance);
      expect(loaded).toBe(instance);
    });

    it('rejects an object that does not implement SearchProvider', async () => {
      await expect(
        loadSearchProvider({ name: 'broken' } as unknown as LocalSearchProvider)
      ).rejects.toThrow(/does not implement SearchProvider/);
    });
  });
});

describe('LocalSearchIndexer output', () => {
  it('writes a versioned index that survives a JSON round trip', async () => {
    const indexer = new LocalSearchIndexer();
    await indexer.initialize(mockProviderContext);
    await indexer.indexDocuments(mockDocs);
    const artifacts = await indexer.finalize();
    const written = JSON.parse(JSON.stringify(artifacts.get('search-index.json')));

    expect(written).toMatchObject({ engine: 'local', version: 1 });

    const provider = new LocalSearchProvider();
    await provider.initialize(mockProviderContext, {
      docs: JSON.parse(JSON.stringify(artifacts.get('docs.json'))),
      indexData: written,
    });
    expect((await provider.search('install'))[0]?.route).toBe('/docs/getting-started');
  });
});
