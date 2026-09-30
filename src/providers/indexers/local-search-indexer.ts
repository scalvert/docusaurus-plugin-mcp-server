import type { ProcessedDoc } from '../../types/index.js';
import type { ContentIndexer, ProviderContext } from '../types.js';
import { documentId } from '../../artifacts/bundle.js';
import {
  buildLocalSearchIndex,
  serializeLocalSearchIndex,
  type SerializedLocalSearchIndex,
} from '../../search/local-search.js';

/**
 * Built-in local search indexer.
 *
 * Produces:
 * - search-index.json: the serialized local search index for runtime queries
 * - docs.json: all processed documents keyed by full URL. The plugin now
 *   writes documents itself and ignores this entry; it stays through 2.x for
 *   code that calls `finalize()` directly, and is removed in 3.0.
 */
export class LocalSearchIndexer implements ContentIndexer {
  readonly name = 'local';

  private baseUrl = '';
  private docsIndex: Record<string, ProcessedDoc> = {};
  private serializedIndex: SerializedLocalSearchIndex | null = null;

  shouldRun(): boolean {
    return true;
  }

  async initialize(context: ProviderContext): Promise<void> {
    this.baseUrl = context.baseUrl.replace(/\/$/, '');
    this.docsIndex = {};
    this.serializedIndex = null;
  }

  async indexDocuments(docs: ProcessedDoc[]): Promise<void> {
    for (const doc of docs) {
      this.docsIndex[documentId(doc, this.baseUrl)] = doc;
    }

    console.log('[LocalSearch] Building search index...');
    this.serializedIndex = serializeLocalSearchIndex(buildLocalSearchIndex(docs, this.baseUrl));
    console.log(`[LocalSearch] Indexed ${docs.length} documents`);
  }

  async finalize(): Promise<Map<string, unknown>> {
    return new Map<string, unknown>([
      ['docs.json', this.docsIndex],
      ['search-index.json', this.serializedIndex],
    ]);
  }

  async getManifestData(): Promise<Record<string, unknown>> {
    return { searchEngine: 'local' };
  }
}
