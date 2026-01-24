import FlexSearch from 'flexsearch';
import type { ProcessedDoc, SearchResult } from '../types/index.js';
import type { IndexableDocument } from './types.js';

export type FlexSearchDocument = FlexSearch.Document<IndexableDocument, string[]>;

/**
 * Create a FlexSearch document index
 */
export function createSearchIndex(): FlexSearchDocument {
  return new FlexSearch.Document<IndexableDocument, string[]>({
    tokenize: 'forward',
    cache: true,
    resolution: 9,
    document: {
      id: 'id',
      index: ['title', 'content', 'headings', 'description'],
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
 * Search the index and return results
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
    limit: limit * 2, // Get extra results for ranking
    enrich: true,
  });

  const docScores = new Map<string, number>();

  for (const fieldResult of rawResults) {
    // With enrich: true, results are objects with id property
    // Cast through unknown to handle FlexSearch's complex types
    const results = fieldResult.result as unknown as Array<{ id: string } | string>;
    for (let i = 0; i < results.length; i++) {
      const item = results[i];
      if (!item) continue;
      // Handle both enriched (object) and non-enriched (string) results
      const docId = typeof item === 'string' ? item : item.id;
      // Higher score for earlier results
      const score = (results.length - i) / results.length;
      const existingScore = docScores.get(docId) ?? 0;
      docScores.set(docId, Math.max(existingScore, score));
    }
  }

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

  for (const term of queryTerms) {
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
 * Find headings that match the query
 */
function findMatchingHeadings(doc: ProcessedDoc, query: string): string[] {
  const queryTerms = query.toLowerCase().split(/\s+/).filter(Boolean);
  const matching: string[] = [];

  for (const heading of doc.headings) {
    const headingLower = heading.text.toLowerCase();
    if (queryTerms.some((term) => headingLower.includes(term))) {
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
