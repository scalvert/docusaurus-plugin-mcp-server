import fs from 'fs-extra';
import type { ProcessedDoc, SearchResult } from '../../types/index.js';
import type {
  SearchProvider,
  ProviderContext,
  SearchProviderInitData,
  SearchOptions,
} from '../types.js';
import {
  importSearchIndex,
  searchIndex,
  type FlexSearchDocument,
} from '../../search/flexsearch-indexer.js';

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

  async initialize(_context: ProviderContext, initData?: SearchProviderInitData): Promise<void> {
    if (!initData) {
      throw new Error('[FlexSearch] SearchProviderInitData required for FlexSearch provider');
    }

    // Pre-loaded data mode (Cloudflare Workers, etc.)
    if (initData.docs && initData.indexData) {
      this.docs = initData.docs;
      this.searchIndex = await importSearchIndex(initData.indexData as Record<string, unknown>);
      this.ready = true;
      return;
    }

    // File-based mode (Node.js)
    if (initData.docsPath && initData.indexPath) {
      if (await fs.pathExists(initData.docsPath)) {
        this.docs = await fs.readJson(initData.docsPath);
      } else {
        throw new Error(`[FlexSearch] Docs file not found: ${initData.docsPath}`);
      }

      if (await fs.pathExists(initData.indexPath)) {
        const indexData = await fs.readJson(initData.indexPath);
        this.searchIndex = await importSearchIndex(indexData);
      } else {
        throw new Error(`[FlexSearch] Search index not found: ${initData.indexPath}`);
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

    const limit = options?.limit ?? 5;
    return searchIndex(this.searchIndex, this.docs, query, { limit });
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

  /**
   * Get all loaded documents (for compatibility with existing server code)
   */
  getDocs(): Record<string, ProcessedDoc> | null {
    return this.docs;
  }

  /**
   * Get the FlexSearch index (for compatibility with existing server code)
   */
  getSearchIndex(): FlexSearchDocument | null {
    return this.searchIndex;
  }
}
