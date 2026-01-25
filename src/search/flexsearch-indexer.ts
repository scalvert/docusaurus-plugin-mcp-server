import FlexSearch from 'flexsearch';
import type { ProcessedDoc, SearchResult } from '../types/index.js';
import type { IndexableDocument } from './types.js';

export type FlexSearchDocument = FlexSearch.Document<IndexableDocument, string[]>;

/**
 * Field weights for search ranking
 * Higher values = more importance
 */
const FIELD_WEIGHTS = {
  title: 3.0,
  headings: 2.0,
  description: 1.5,
  content: 1.0,
} as const;

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

/**
 * Create a FlexSearch document index with enhanced configuration
 *
 * Features:
 * - Full substring matching (finds "auth" in "authentication")
 * - English stemming (finds "authenticate" when searching "authentication")
 * - Context-aware scoring for phrase matching
 * - Optimized resolution for relevance ranking
 */
export function createSearchIndex(): FlexSearchDocument {
  return new FlexSearch.Document<IndexableDocument, string[]>({
    // Use 'full' tokenization for substring matching
    // This allows "auth" to match "authentication"
    tokenize: 'full',

    // Enable caching for faster repeated queries
    cache: 100,

    // Higher resolution = more granular ranking (1-9)
    resolution: 9,

    // Enable context for phrase/proximity matching
    context: {
      resolution: 2,
      depth: 2,
      bidirectional: true,
    },

    // Apply stemming to normalize word forms
    encode: (str: string) => {
      // Normalize to lowercase and split into words
      const words = str.toLowerCase().split(/[\s\-_.,;:!?'"()\[\]{}]+/);
      // Apply stemmer to each word
      return words.filter(Boolean).map(englishStemmer);
    },

    // Document schema
    document: {
      id: 'id',
      // Index these fields for searching
      index: ['title', 'content', 'headings', 'description'],
      // Store these fields in results (for enriched queries)
      store: ['title', 'description'],
    },
  });
}

/**
 * Add a document to the search index
 */
export function addDocumentToIndex(index: FlexSearchDocument, doc: ProcessedDoc): void {
  const indexable: IndexableDocument = {
    id: doc.route,
    title: doc.title,
    content: doc.markdown,
    headings: doc.headings.map((h) => h.text).join(' '),
    description: doc.description,
  };

  index.add(indexable);
}

/**
 * Build the search index from processed documents
 */
export function buildSearchIndex(docs: ProcessedDoc[]): FlexSearchDocument {
  const index = createSearchIndex();

  for (const doc of docs) {
    addDocumentToIndex(index, doc);
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
export function searchIndex(
  index: FlexSearchDocument,
  docs: Record<string, ProcessedDoc>,
  query: string,
  options: { limit?: number } = {}
): SearchResult[] {
  const { limit = 5 } = options;

  // Search across all fields
  const rawResults = index.search(query, {
    limit: limit * 3, // Get extra results for better ranking after weighting
    enrich: true,
  });

  // Aggregate scores across fields with weighting
  const docScores = new Map<string, number>();

  for (const fieldResult of rawResults) {
    // Determine which field this result is from
    const field = fieldResult.field as keyof typeof FIELD_WEIGHTS;
    const fieldWeight = FIELD_WEIGHTS[field] ?? 1.0;

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
    const headingStemmed = headingLower
      .split(/\s+/)
      .map(englishStemmer)
      .join(' ');

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
  data: Record<string, unknown>
): Promise<FlexSearchDocument> {
  const index = createSearchIndex();

  for (const [key, value] of Object.entries(data)) {
    // FlexSearch's import expects the data in a specific format
    await (index as unknown as { import: (key: string, data: unknown) => Promise<void> }).import(
      key,
      value
    );
  }

  return index;
}
