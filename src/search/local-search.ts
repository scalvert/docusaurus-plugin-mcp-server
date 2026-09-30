import MiniSearch from 'minisearch';
import { stemmer } from 'stemmer';
import { documentId } from '../artifacts/bundle.js';
import { ConfigurationError, MIGRATION_GUIDE } from '../errors.js';
import type {
  LocalSearchConfig,
  LocalSearchField,
  ProcessedDoc,
  SearchResult,
} from '../types/index.js';

/**
 * Built-in local search: BM25+ ranking over each page's title, route slug,
 * headings, description, and body.
 *
 * Query words are OR-combined, so a page does not have to contain every word
 * to match; pages that contain more of them, rarer ones, or in more important
 * fields rank higher. Tokenization and stemming are fixed here rather than
 * configurable, so the index written at build time always matches the one
 * queried at runtime.
 */

/** Format version of the serialized index. Bump when the indexed shape changes. */
export const LOCAL_SEARCH_INDEX_VERSION = 1;

const FIELDS = ['title', 'slug', 'headings', 'description', 'content'] as const;

/** Default per-field boosts. Higher values weigh matches in that field more. */
export const DEFAULT_FIELD_BOOSTS: Record<LocalSearchField, number> = {
  title: 3,
  slug: 3,
  headings: 2,
  description: 1.5,
  content: 1,
};

// Common English words that carry no signal for documentation queries.
const STOP_WORDS = new Set(
  (
    'a an and are as at be by can do does for from how i if in into is it its my of on or so ' +
    'that the their then this to use using was what when where which while who why will with you your'
  ).split(' ')
);

// Prefix matching lets "auth" find "authentication". Below this length a
// prefix matches too much of the vocabulary to be useful.
const MIN_PREFIX_LENGTH = 3;

// Search cost grows with every OR'd term, and fastest with prefix terms,
// each of which expands to every indexed word it starts with. docs_search is
// usually unauthenticated, so a long or repetitive query must not be able to
// exhaust memory. Real queries are a handful of words, well under both caps.
/** Distinct terms searched per query; later terms are ignored. */
export const MAX_QUERY_TERMS = 16;
/** Of those, how many (in query order) also match as prefixes. */
const MAX_PREFIX_TERMS = 8;

/**
 * Split text into lowercase words, with accents folded ("déploiement" ->
 * "deploiement"). NFD separates each accent into a combining mark; the marks
 * are removed before splitting, since the split would otherwise break the word
 * at each one.
 */
function tokenize(text: string): string[] {
  return text
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
}

/**
 * Whether a word in the page matches one of the query's terms the way search
 * does: the same stem, or (for terms long enough) a stem it starts with.
 */
function matchesQuery(word: string, terms: string[]): boolean {
  const stem = processTerm(word);
  if (stem === null) return false;
  return terms.some(
    (term) => stem === term || (term.length >= MIN_PREFIX_LENGTH && stem.startsWith(term))
  );
}

/**
 * Drop stopwords and reduce each word to its Porter stem, so "indexing",
 * "indexed", and "indexes" all match "index", and "route" matches "routes".
 */
function processTerm(term: string): string | null {
  return STOP_WORDS.has(term) ? null : stemmer(term);
}

/**
 * A query's searchable terms, processed exactly as the index processes text:
 * stopwords dropped, one entry per distinct stem, at most
 * {@link MAX_QUERY_TERMS}. `words` holds the first word seen for each stem,
 * for handing back to MiniSearch (which stems again); `stems` is what page
 * text is compared against for snippets and headings.
 */
function queryTerms(query: string): { words: string[]; stems: string[] } {
  const byStem = new Map<string, string>();
  for (const word of tokenize(query)) {
    const stem = processTerm(word);
    if (stem === null || byStem.has(stem)) continue;
    byStem.set(stem, word);
    if (byStem.size === MAX_QUERY_TERMS) break;
  }
  return { words: [...byStem.values()], stems: [...byStem.keys()] };
}

interface IndexedFields {
  id: string;
  title: string;
  slug: string;
  headings: string;
  description: string;
  content: string;
}

function miniSearchOptions() {
  return {
    idField: 'id',
    fields: [...FIELDS],
    tokenize,
    processTerm,
  };
}

/** Route path as words: "/api/indexing/rotate-token" -> "api indexing rotate token". */
function routeWords(route: string): string {
  return route
    .split(/[/\-_.]+/)
    .filter(Boolean)
    .join(' ');
}

/** A built local search index, ready to query. */
export type LocalSearchIndex = MiniSearch<IndexedFields>;

/** Build the index from processed documents. */
export function buildLocalSearchIndex(docs: ProcessedDoc[], baseUrl?: string): LocalSearchIndex {
  const index = new MiniSearch<IndexedFields>(miniSearchOptions());
  index.addAll(
    docs.map((doc) => ({
      id: documentId(doc, baseUrl),
      title: doc.title,
      slug: routeWords(doc.route),
      headings: doc.headings.map((h) => h.text).join(' '),
      description: doc.description,
      content: doc.markdown,
    }))
  );
  return index;
}

/** Serialized index, as written to `search-index.json`. */
export interface SerializedLocalSearchIndex {
  engine: 'local';
  version: number;
  index: unknown;
}

/** Serialize an index for `search-index.json`. */
export function serializeLocalSearchIndex(index: LocalSearchIndex): SerializedLocalSearchIndex {
  return { engine: 'local', version: LOCAL_SEARCH_INDEX_VERSION, index: index.toJSON() };
}

/**
 * Load an index written by {@link serializeLocalSearchIndex}.
 *
 * Throws if the data was produced by a different engine or index version, such
 * as a 1.x FlexSearch `search-index.json`, instead of returning no results.
 */
export function loadLocalSearchIndex(data: unknown): LocalSearchIndex {
  const serialized = data as Partial<SerializedLocalSearchIndex> | null;
  if (
    !serialized ||
    serialized.engine !== 'local' ||
    serialized.version !== LOCAL_SEARCH_INDEX_VERSION ||
    !serialized.index
  ) {
    throw new ConfigurationError(
      `[MCP] search-index.json was not produced by this version of docusaurus-plugin-mcp-server ` +
        `(expected local search index v${LOCAL_SEARCH_INDEX_VERSION}). ` +
        `Rebuild the site (docusaurus build) and redeploy build/mcp/. See ${MIGRATION_GUIDE}.`
    );
  }
  return MiniSearch.loadJS<IndexedFields>(
    serialized.index as Parameters<typeof MiniSearch.loadJS>[0],
    miniSearchOptions()
  );
}

/** Search the index and return ranked results. */
export function searchLocalIndex(
  index: LocalSearchIndex,
  docs: Record<string, ProcessedDoc>,
  query: string,
  options: { limit?: number; fieldBoosts?: LocalSearchConfig['fieldBoosts'] } = {}
): SearchResult[] {
  const { limit = 16 } = options;
  const results: SearchResult[] = [];
  if (limit <= 0) return results;

  const boost = { ...DEFAULT_FIELD_BOOSTS, ...options.fieldBoosts };
  const { words, stems: terms } = queryTerms(query);
  if (words.length === 0) return results;

  // Search the capped, de-duplicated words, not the raw query (see MAX_QUERY_TERMS).
  const hits = index.search(words.join(' '), {
    boost,
    prefix: (term, i) => i < MAX_PREFIX_TERMS && term.length >= MIN_PREFIX_LENGTH,
    combineWith: 'OR',
  });

  for (const hit of hits) {
    const doc = docs[hit.id];
    if (!doc) continue;
    results.push({
      url: hit.id,
      route: doc.route,
      title: doc.title,
      score: hit.score,
      snippet: generateSnippet(doc.markdown, terms),
      matchingHeadings: findMatchingHeadings(doc, terms),
    });
    if (results.length >= limit) break;
  }
  return results;
}

/**
 * A snippet of the page around the first word whose stem is a query term, so
 * stopwords ("how", "do") never anchor it and "route" finds "Routes".
 */
function generateSnippet(markdown: string, terms: string[]): string {
  const maxLength = 200;

  let bestIndex = -1;
  let bestLength = 0;
  if (terms.length > 0) {
    // Words as they appear in the page, accents and all; each is folded and
    // stemmed by the same functions as the index before comparing.
    for (const match of markdown.matchAll(/[\p{L}\p{M}\p{N}]+/gu)) {
      if (tokenize(match[0]).some((word) => matchesQuery(word, terms))) {
        bestIndex = match.index ?? 0;
        bestLength = match[0].length;
        break;
      }
    }
  }

  if (bestIndex === -1) {
    // No term found, return beginning of document
    return markdown.slice(0, maxLength) + (markdown.length > maxLength ? '...' : '');
  }

  const snippetStart = Math.max(0, bestIndex - 50);
  const snippetEnd = Math.min(markdown.length, bestIndex + bestLength + 150);

  const snippet = markdown
    .slice(snippetStart, snippetEnd)
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
 * Headings that contain a query term, matched the way search matches (see
 * {@link matchesQuery}), so stopwords never match and "route" matches a
 * "Routes" heading. At most three.
 */
function findMatchingHeadings(doc: ProcessedDoc, terms: string[]): string[] {
  if (terms.length === 0) return [];
  const matching: string[] = [];

  for (const heading of doc.headings) {
    if (tokenize(heading.text).some((word) => matchesQuery(word, terms))) {
      matching.push(heading.text);
      if (matching.length === 3) break;
    }
  }

  return matching;
}
