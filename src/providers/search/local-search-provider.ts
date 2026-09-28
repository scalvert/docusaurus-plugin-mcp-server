import type { LocalSearchConfig, ProcessedDoc, SearchResult } from '../../types/index.js';
import type {
  SearchProvider,
  ProviderContext,
  SearchProviderInitData,
  SearchOptions,
} from '../types.js';
import {
  loadLocalSearchIndex,
  searchLocalIndex,
  type LocalSearchIndex,
} from '../../search/local-search.js';

/**
 * Built-in local search provider.
 *
 * Answers queries from the `search-index.json` written by the local search
 * indexer, with no external service. Supports file-based loading (Node.js)
 * and pre-loaded data (serverless and edge runtimes).
 */
export class LocalSearchProvider implements SearchProvider {
  readonly name = 'local';

  private docs: Record<string, ProcessedDoc> | null = null;
  private searchIndex: LocalSearchIndex | null = null;
  private readonly config?: LocalSearchConfig;

  constructor(config?: LocalSearchConfig) {
    this.config = config;
  }

  async initialize(_context: ProviderContext, initData?: SearchProviderInitData): Promise<void> {
    if (!initData) {
      throw new Error(
        '[LocalSearch] SearchProviderInitData required for the local search provider'
      );
    }

    // Pre-loaded data mode (serverless and edge runtimes)
    if (initData.docs && initData.indexData) {
      this.docs = initData.docs;
      this.searchIndex = loadLocalSearchIndex(initData.indexData);
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
        throw new Error(`[LocalSearch] Docs file not found or unreadable: ${initData.docsPath}`);
      }

      let indexData: unknown;
      try {
        indexData = await readJson(initData.indexPath);
      } catch {
        throw new Error(
          `[LocalSearch] Search index not found or unreadable: ${initData.indexPath}`
        );
      }
      this.searchIndex = loadLocalSearchIndex(indexData);
      return;
    }

    throw new Error(
      '[LocalSearch] Invalid init data: must provide either file paths (docsPath, indexPath) or pre-loaded data (docs, indexData)'
    );
  }

  isReady(): boolean {
    return this.docs !== null && this.searchIndex !== null;
  }

  async search(query: string, options?: SearchOptions): Promise<SearchResult[]> {
    if (!this.docs || !this.searchIndex) {
      throw new Error('[LocalSearch] Provider not initialized');
    }

    return searchLocalIndex(this.searchIndex, this.docs, query, {
      limit: options?.limit ?? 16,
      fieldBoosts: this.config?.fieldBoosts,
    });
  }

  async getDocument(url: string): Promise<ProcessedDoc | null> {
    if (!this.docs) {
      throw new Error('[LocalSearch] Provider not initialized');
    }

    return this.docs[url] ?? null;
  }

  async healthCheck(): Promise<{ healthy: boolean; message?: string }> {
    if (!this.isReady()) {
      return { healthy: false, message: 'Local search provider not initialized' };
    }

    return {
      healthy: true,
      message: `Local search provider ready with ${this.getDocCount()} documents`,
    };
  }

  getDocCount(): number {
    return this.docs ? Object.keys(this.docs).length : 0;
  }
}
