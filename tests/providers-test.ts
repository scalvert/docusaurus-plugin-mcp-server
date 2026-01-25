import { describe, it, expect, beforeEach } from 'vitest';
import { FlexSearchIndexer } from '../src/providers/indexers/flexsearch-indexer.js';
import { FlexSearchProvider } from '../src/providers/search/flexsearch-provider.js';
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

describe('FlexSearchIndexer', () => {
  let indexer: FlexSearchIndexer;

  beforeEach(() => {
    indexer = new FlexSearchIndexer();
  });

  it('should have correct name', () => {
    expect(indexer.name).toBe('flexsearch');
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

    // Check docs.json structure
    const docsJson = artifacts.get('docs.json') as Record<string, ProcessedDoc>;
    expect(docsJson['/docs/getting-started']).toBeDefined();
    expect(docsJson['/docs/api-reference']).toBeDefined();
    const gettingStartedDoc = docsJson['/docs/getting-started'];
    expect(gettingStartedDoc?.title).toBe('Getting Started');
  });

  it('should return manifest data', async () => {
    await indexer.initialize(mockProviderContext);
    await indexer.indexDocuments(mockDocs);
    const manifestData = await indexer.getManifestData!();

    expect(manifestData.searchEngine).toBe('flexsearch');
  });
});

describe('FlexSearchProvider', () => {
  let provider: FlexSearchProvider;
  let indexer: FlexSearchIndexer;
  let artifacts: Map<string, unknown>;

  beforeEach(async () => {
    // First, create artifacts using the indexer
    indexer = new FlexSearchIndexer();
    await indexer.initialize(mockProviderContext);
    await indexer.indexDocuments(mockDocs);
    artifacts = await indexer.finalize();

    provider = new FlexSearchProvider();
  });

  it('should have correct name', () => {
    expect(provider.name).toBe('flexsearch');
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

  it('should get document by route', async () => {
    await provider.initialize(mockProviderContext, {
      docs: artifacts.get('docs.json') as Record<string, ProcessedDoc>,
      indexData: artifacts.get('search-index.json') as Record<string, unknown>,
    });

    const doc = await provider.getDocument('/docs/getting-started');
    expect(doc).toBeDefined();
    expect(doc?.title).toBe('Getting Started');
  });

  it('should get document with normalized route', async () => {
    await provider.initialize(mockProviderContext, {
      docs: artifacts.get('docs.json') as Record<string, ProcessedDoc>,
      indexData: artifacts.get('search-index.json') as Record<string, unknown>,
    });

    // Without leading slash
    const doc = await provider.getDocument('docs/getting-started');
    expect(doc).toBeDefined();
    expect(doc?.title).toBe('Getting Started');
  });

  it('should return null for non-existent document', async () => {
    await provider.initialize(mockProviderContext, {
      docs: artifacts.get('docs.json') as Record<string, ProcessedDoc>,
      indexData: artifacts.get('search-index.json') as Record<string, unknown>,
    });

    const doc = await provider.getDocument('/docs/non-existent');
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
});

describe('Provider Loader', () => {
  describe('loadIndexer', () => {
    it('should load built-in flexsearch indexer', async () => {
      const indexer = await loadIndexer('flexsearch');
      expect(indexer.name).toBe('flexsearch');
      expect(indexer instanceof FlexSearchIndexer).toBe(true);
    });

    it('should throw error for non-existent module', async () => {
      await expect(loadIndexer('./non-existent-module.js')).rejects.toThrow();
    });
  });

  describe('loadSearchProvider', () => {
    it('should load built-in flexsearch provider', async () => {
      const provider = await loadSearchProvider('flexsearch');
      expect(provider.name).toBe('flexsearch');
      expect(provider instanceof FlexSearchProvider).toBe(true);
    });

    it('should throw error for non-existent module', async () => {
      await expect(loadSearchProvider('./non-existent-module.js')).rejects.toThrow();
    });
  });
});
