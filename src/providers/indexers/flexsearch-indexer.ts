import type { ProcessedDoc } from '../../types/index.js';
import type { ContentIndexer, ProviderContext } from '../types.js';
import { buildSearchIndex, exportSearchIndex } from '../../search/flexsearch-core.js';

/**
 * Built-in FlexSearch content indexer.
 *
 * This indexer builds a local FlexSearch index and produces:
 * - docs.json: All processed documents keyed by full URL
 * - search-index.json: Exported FlexSearch index for runtime search
 */
export class FlexSearchIndexer implements ContentIndexer {
  readonly name = 'flexsearch';

  private baseUrl = '';
  private docsIndex: Record<string, ProcessedDoc> = {};
  private exportedIndex: unknown = null;
  private docCount = 0;

  /**
   * FlexSearch indexer always runs by default.
   * It respects the indexers configuration - if not included, it won't run.
   */
  shouldRun(): boolean {
    return true;
  }

  async initialize(context: ProviderContext): Promise<void> {
    // Reset state for fresh indexing
    this.baseUrl = context.baseUrl.replace(/\/$/, '');
    this.docsIndex = {};
    this.exportedIndex = null;
    this.docCount = 0;
  }

  async indexDocuments(docs: ProcessedDoc[]): Promise<void> {
    this.docCount = docs.length;

    // Build docs index (keyed by full URL)
    for (const doc of docs) {
      const fullUrl = `${this.baseUrl}${doc.route}`;
      this.docsIndex[fullUrl] = doc;
    }

    // Build and export FlexSearch index (use full URLs as document IDs)
    console.log('[FlexSearch] Building search index...');
    const searchIndex = buildSearchIndex(docs, this.baseUrl);
    this.exportedIndex = await exportSearchIndex(searchIndex);
    console.log(`[FlexSearch] Indexed ${this.docCount} documents`);
  }

  async finalize(): Promise<Map<string, unknown>> {
    const artifacts = new Map<string, unknown>();

    // docs.json - all documents keyed by full URL
    artifacts.set('docs.json', this.docsIndex);

    // search-index.json - exported FlexSearch index
    artifacts.set('search-index.json', this.exportedIndex);

    return artifacts;
  }

  async getManifestData(): Promise<Record<string, unknown>> {
    return {
      searchEngine: 'flexsearch',
    };
  }
}
