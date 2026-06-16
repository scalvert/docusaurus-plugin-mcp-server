import FlexSearch from 'flexsearch';
import type {
  FlexSearchConfig,
  FlexSearchField,
  ProcessedDoc,
  SearchResult,
} from '../types/index.js';
import type { IndexableDocument } from './types.js';

export type FlexSearchDocument = FlexSearch.Document<IndexableDocument, string[]>;

/**
 * Default field weights for search ranking
 * Higher values = more importance
 */
export const DEFAULT_FIELD_WEIGHTS: Record<FlexSearchField, number> = {
  title: 3.0,
  headings: 2.0,
  description: 1.5,
  content: 1.0,
};

function resolveFieldWeights(
  overrides?: FlexSearchConfig['fieldWeights']
): Record<FlexSearchField, number> {
  return { ...DEFAULT_FIELD_WEIGHTS, ...overrides };
}

/**
 * Simple English stemmer
 * Handles common suffixes for better matching
 */
function englishStemmer(word: string): string {
  // Only process words longer than 3 characters
  if (word.length <= 3) return word;

  return (
    word
      // -ing endings
      .replace(/ing$/, '')
      // -tion, -sion endings -> t, s
      .replace(/tion$/, 't')
      .replace(/sion$/, 's')
      // -ed endings (careful with short words)
      .replace(/([^aeiou])ed$/, '$1')
      // -es endings
      .replace(/([^aeiou])es$/, '$1')
      // -ly endings
      .replace(/ly$/, '')
      // -ment endings
      .replace(/ment$/, '')
      // -ness endings
      .replace(/ness$/, '')
      // -ies -> y
      .replace(/ies$/, 'y')
      // -s endings (simple plural)
      .replace(/([^s])s$/, '$1')
  );
}

const DEFAULT_FLEXSEARCH_CONFIG = {
  tokenize: 'forward' as const,
  cache: 100,
  resolution: 9,
  context: { resolution: 2, depth: 2, bidirectional: true },
  encode: (str: string) =>
    str
      .toLowerCase()
      .split(/[\s\-_.,;:!?'"()[\]{}]+/)
      .filter(Boolean)
      .map(englishStemmer),
};

/**
 * Create a FlexSearch document index.
 *
 * Defaults are tuned for English: forward-prefix tokenization, English
 * stemming, bidirectional context for phrase matching, max resolution.
 * Pass `config` to override any of these — useful for non-English content
 * or large doc sets where the defaults produce an oversized index.
 *
 * If a custom config is passed at build time, the same config must be
 * passed at runtime to {@link importSearchIndex} (and to the search
 * provider), otherwise the deserialized index returns no results.
 */
export function createSearchIndex(config?: FlexSearchConfig): FlexSearchDocument {
  // `false` means caller explicitly disabled context; pass it through.
  // Otherwise fall back to the bundled default.
  const context =
    config?.context === false
      ? (false as unknown as { resolution?: number; depth?: number; bidirectional?: boolean })
      : (config?.context ?? DEFAULT_FLEXSEARCH_CONFIG.context);

  return new FlexSearch.Document<IndexableDocument, string[]>({
    tokenize: config?.tokenize ?? DEFAULT_FLEXSEARCH_CONFIG.tokenize,
    cache: config?.cache ?? DEFAULT_FLEXSEARCH_CONFIG.cache,
    resolution: config?.resolution ?? DEFAULT_FLEXSEARCH_CONFIG.resolution,
    context,
    encode: config?.encode ?? DEFAULT_FLEXSEARCH_CONFIG.encode,
    document: {
      id: 'id',
      index: ['title', 'content', 'headings', 'description'],
      store: ['title', 'description'],
    },
  });
}

/**
 * Add a document to the search index
 *
 * @param index - The FlexSearch index
 * @param doc - The document to add
 * @param baseUrl - Optional base URL to construct full URL as document ID
 */
export function addDocumentToIndex(
  index: FlexSearchDocument,
  doc: ProcessedDoc,
  baseUrl?: string
): void {
  // Use full URL as ID if baseUrl is provided, otherwise use route
  const id = baseUrl ? `${baseUrl.replace(/\/$/, '')}${doc.route}` : doc.route;

  const indexable: IndexableDocument = {
    id,
    title: doc.title,
    content: doc.markdown,
    headings: doc.headings.map((h) => h.text).join(' '),
    description: doc.description,
  };

  index.add(indexable);
}

/**
 * Build the search index from processed documents
 *
 * @param docs - Documents to index
 * @param baseUrl - Optional base URL to construct full URLs as document IDs
 */
export function buildSearchIndex(
  docs: ProcessedDoc[],
  baseUrl?: string,
  config?: FlexSearchConfig
): FlexSearchDocument {
  const index = createSearchIndex(config);

  for (const doc of docs) {
    addDocumentToIndex(index, doc, baseUrl);
  }

  return index;
}

/**
 * Search the index and return results with weighted ranking
 *
 * Ranking combines:
 * - Field importance (title > headings > description > content)
 * - Position in results (earlier = more relevant)
 */
export function querySearchIndex(
  index: FlexSearchDocument,
  docs: Record<string, ProcessedDoc>,
  query: string,
  options: { limit?: number; fieldWeights?: FlexSearchConfig['fieldWeights'] } = {}
): SearchResult[] {
  const { limit = 16, fieldWeights } = options;
  const weights = resolveFieldWeights(fieldWeights);

  // Search across all fields
  const rawResults = index.search(query, {
    limit: limit * 3, // Get extra results for better ranking after weighting
    enrich: true,
  });

  // Aggregate scores across fields with weighting
  const docScores = new Map<string, number>();

  for (const fieldResult of rawResults) {
    // Determine which field this result is from
    const field = fieldResult.field as FlexSearchField;
    const fieldWeight = weights[field] ?? 1.0;

    // With enrich: true, results are objects with id property
    const results = fieldResult.result as unknown as Array<{ id: string } | string>;

    for (let i = 0; i < results.length; i++) {
      const item = results[i];
      if (!item) continue;

      const docId = typeof item === 'string' ? item : item.id;

      // Position-based score (earlier = higher)
      const positionScore = (results.length - i) / results.length;

      // Apply field weight to position score
      const weightedScore = positionScore * fieldWeight;

      // Combine with existing score (additive for multi-field matches)
      const existingScore = docScores.get(docId) ?? 0;
      docScores.set(docId, existingScore + weightedScore);
    }
  }

  // Build results array
  const results: SearchResult[] = [];

  for (const [docId, score] of docScores) {
    const doc = docs[docId];
    if (!doc) continue;

    results.push({
      url: docId, // docId is the full URL when indexed with baseUrl
      route: doc.route,
      title: doc.title,
      score,
      snippet: generateSnippet(doc.markdown, query),
      matchingHeadings: findMatchingHeadings(doc, query),
    });
  }

  // Sort by score (highest first) and limit
  results.sort((a, b) => b.score - a.score);
  return results.slice(0, limit);
}

/**
 * Generate a snippet from the markdown content around the query terms
 */
export function generateSnippet(markdown: string, query: string): string {
  const maxLength = 200;
  const queryTerms = query.toLowerCase().split(/\s+/).filter(Boolean);

  if (queryTerms.length === 0) {
    return markdown.slice(0, maxLength) + (markdown.length > maxLength ? '...' : '');
  }

  const lowerMarkdown = markdown.toLowerCase();
  let bestIndex = -1;
  let bestTerm = '';

  // Also try stemmed versions of query terms
  const allTerms = [...queryTerms, ...queryTerms.map(englishStemmer)];

  for (const term of allTerms) {
    const index = lowerMarkdown.indexOf(term);
    if (index !== -1 && (bestIndex === -1 || index < bestIndex)) {
      bestIndex = index;
      bestTerm = term;
    }
  }

  if (bestIndex === -1) {
    // No term found, return beginning of document
    return markdown.slice(0, maxLength) + (markdown.length > maxLength ? '...' : '');
  }

  const snippetStart = Math.max(0, bestIndex - 50);
  const snippetEnd = Math.min(markdown.length, bestIndex + bestTerm.length + 150);

  let snippet = markdown.slice(snippetStart, snippetEnd);

  snippet = snippet
    // Remove markdown headings
    .replace(/^#{1,6}\s+/gm, '')
    // Remove markdown links but keep text
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    // Remove markdown images
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, '')
    // Remove code block markers
    .replace(/```[a-z]*\n?/g, '')
    // Remove inline code backticks
    .replace(/`([^`]+)`/g, '$1')
    // Clean up whitespace
    .replace(/\s+/g, ' ')
    .trim();

  const prefix = snippetStart > 0 ? '...' : '';
  const suffix = snippetEnd < markdown.length ? '...' : '';

  return prefix + snippet + suffix;
}

/**
 * Find headings that match the query (including stemmed forms)
 */
function findMatchingHeadings(doc: ProcessedDoc, query: string): string[] {
  const queryTerms = query.toLowerCase().split(/\s+/).filter(Boolean);
  // Include stemmed versions for better matching
  const allTerms = [...queryTerms, ...queryTerms.map(englishStemmer)];
  const matching: string[] = [];

  for (const heading of doc.headings) {
    const headingLower = heading.text.toLowerCase();
    const headingStemmed = headingLower.split(/\s+/).map(englishStemmer).join(' ');

    // Check if any query term matches the heading or its stemmed form
    if (
      allTerms.some(
        (term) => headingLower.includes(term) || headingStemmed.includes(englishStemmer(term))
      )
    ) {
      matching.push(heading.text);
    }
  }

  return matching.slice(0, 3); // Limit to 3 matching headings
}

/**
 * Export the search index to a serializable format
 */
export async function exportSearchIndex(index: FlexSearchDocument): Promise<unknown> {
  const exportData: Record<string, unknown> = {};

  await index.export((key, data) => {
    exportData[key as string] = data;
  });

  return exportData;
}

/**
 * Import a search index from serialized data
 */
export async function importSearchIndex(
  data: Record<string, unknown>,
  config?: FlexSearchConfig
): Promise<FlexSearchDocument> {
  const index = createSearchIndex(config);

  for (const [key, value] of Object.entries(data)) {
    // FlexSearch's import expects the data in a specific format
    await (index as unknown as { import: (key: string, data: unknown) => Promise<void> }).import(
      key,
      value
    );
  }

  return index;
}
