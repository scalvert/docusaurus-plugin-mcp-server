import type { FlexSearchConfig, ProcessedDoc, SearchResult } from '../../types/index.js';
import type {
  SearchProvider,
  ProviderContext,
  SearchProviderInitData,
  SearchOptions,
} from '../types.js';
import {
  importSearchIndex,
  querySearchIndex,
  type FlexSearchDocument,
} from '../../search/flexsearch-core.js';

/**
 * Built-in FlexSearch search provider.
 *
 * This provider uses the local FlexSearch index for search queries.
 * Supports both file-based loading (Node.js) and pre-loaded data (Workers).
 */
export class FlexSearchProvider implements SearchProvider {
  readonly name = 'flexsearch';

  private docs: Record<string, ProcessedDoc> | null = null;
  private searchIndex: FlexSearchDocument | null = null;
  private ready = false;
  private readonly config?: FlexSearchConfig;

  constructor(config?: FlexSearchConfig) {
    this.config = config;
  }

  async initialize(_context: ProviderContext, initData?: SearchProviderInitData): Promise<void> {
    if (!initData) {
      throw new Error('[FlexSearch] SearchProviderInitData required for FlexSearch provider');
    }

    // Pre-loaded data mode (Cloudflare Workers, etc.)
    if (initData.docs && initData.indexData) {
      this.docs = initData.docs;
      this.searchIndex = await importSearchIndex(
        initData.indexData as Record<string, unknown>,
        this.config
      );
      this.ready = true;
      return;
    }

    // File-based mode (Node.js). `fs` is imported dynamically so this module
    // pulls in no Node built-ins on the web-standard/edge (data-mode) path.
    if (initData.docsPath && initData.indexPath) {
      const { readFile } = await import('node:fs/promises');
      const readJson = async (path: string) => JSON.parse(await readFile(path, 'utf8'));

      try {
        this.docs = await readJson(initData.docsPath);
      } catch {
        throw new Error(`[FlexSearch] Docs file not found or unreadable: ${initData.docsPath}`);
      }

      try {
        const indexData = await readJson(initData.indexPath);
        this.searchIndex = await importSearchIndex(indexData, this.config);
      } catch {
        throw new Error(`[FlexSearch] Search index not found or unreadable: ${initData.indexPath}`);
      }

      this.ready = true;
      return;
    }

    throw new Error(
      '[FlexSearch] Invalid init data: must provide either file paths (docsPath, indexPath) or pre-loaded data (docs, indexData)'
    );
  }

  isReady(): boolean {
    return this.ready && this.docs !== null && this.searchIndex !== null;
  }

  async search(query: string, options?: SearchOptions): Promise<SearchResult[]> {
    if (!this.isReady() || !this.docs || !this.searchIndex) {
      throw new Error('[FlexSearch] Provider not initialized');
    }

    const limit = options?.limit ?? 16;
    return querySearchIndex(this.searchIndex, this.docs, query, {
      limit,
      fieldWeights: this.config?.fieldWeights,
    });
  }

  async getDocument(url: string): Promise<ProcessedDoc | null> {
    if (!this.docs) {
      throw new Error('[FlexSearch] Provider not initialized');
    }

    // Direct lookup by URL
    return this.docs[url] ?? null;
  }

  async healthCheck(): Promise<{ healthy: boolean; message?: string }> {
    if (!this.isReady()) {
      return { healthy: false, message: 'FlexSearch provider not initialized' };
    }

    const docCount = this.docs ? Object.keys(this.docs).length : 0;
    return {
      healthy: true,
      message: `FlexSearch provider ready with ${docCount} documents`,
    };
  }

  getDocCount(): number {
    return this.docs ? Object.keys(this.docs).length : 0;
  }
}
