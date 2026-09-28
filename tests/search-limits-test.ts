/**
 * docs_search is usually unauthenticated, and search cost grows with every
 * OR'd term (fastest with prefix terms). These tests guard the caps that keep
 * a long or repetitive query from exhausting memory, as a 10 KB query could
 * before them (about 1 GB of heap on a 1000-page site).
 */

import { describe, it, expect, beforeAll, vi } from 'vitest';
import MiniSearch from 'minisearch';
import {
  buildLocalSearchIndex,
  searchLocalIndex,
  MAX_QUERY_TERMS,
  type LocalSearchIndex,
} from '../src/search/local-search.js';
import { docsSearchTool, MAX_QUERY_LENGTH } from '../src/mcp/tools/docs-search.js';
import type { ProcessedDoc } from '../src/types/index.js';

// Deterministic synthetic corpus with a dense vocabulary, so prefix terms
// expand to many indexed words, the worst case for search cost.
function syntheticCorpus(pages: number): ProcessedDoc[] {
  let seed = 7;
  const rnd = () => (seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31;
  const syllables = ['ka', 'lo', 'mi', 'tra', 'zen', 'dor', 'quil', 'ex', 'ant', 'ion', 'er'];
  const vocab = Array.from({ length: 4000 }, () => {
    let w = '';
    for (let j = 0, n = 2 + Math.floor(rnd() * 3); j < n; j++) {
      w += syllables[Math.floor(rnd() * syllables.length)];
    }
    return w;
  });
  const words = (n: number) =>
    Array.from({ length: n }, () => vocab[Math.floor(vocab.length * rnd() ** 3)]).join(' ');

  return Array.from({ length: pages }, (_, i) => ({
    route: `/docs/page-${i}`,
    title: words(4),
    description: words(12),
    markdown: `# ${words(3)}\n\n${words(400)}`,
    headings: [],
  }));
}

describe('docs_search query limits', () => {
  let index: LocalSearchIndex;
  let docs: Record<string, ProcessedDoc>;

  beforeAll(() => {
    const corpus = syntheticCorpus(300);
    index = buildLocalSearchIndex(corpus);
    docs = Object.fromEntries(corpus.map((d) => [d.route, d]));
  });

  /** The query string search actually handed to MiniSearch. */
  function searchedQuery(query: string): string {
    const spy = vi.spyOn(MiniSearch.prototype, 'search');
    try {
      searchLocalIndex(index, docs, query);
      return String(spy.mock.calls[0]?.[0] ?? '');
    } finally {
      spy.mockRestore();
    }
  }

  it('rejects queries longer than the schema limit', () => {
    const schema = docsSearchTool.inputSchema;
    expect(schema.safeParse({ query: 'a'.repeat(MAX_QUERY_LENGTH) }).success).toBe(true);
    expect(schema.safeParse({ query: 'a'.repeat(MAX_QUERY_LENGTH + 1) }).success).toBe(false);
  });

  it('searches each distinct term once', () => {
    expect(searchedQuery('kal '.repeat(2500))).toBe('kal');
    // Same stem: "indexing", "indexed", "indexes" are all "index".
    expect(searchedQuery('indexing indexed indexes index')).toBe('indexing');
  });

  it(`searches at most ${MAX_QUERY_TERMS} distinct terms, in query order`, () => {
    const terms = Array.from({ length: MAX_QUERY_TERMS + 10 }, (_, i) => `term${i}`);
    const searched = searchedQuery(terms.join(' ')).split(' ');
    expect(searched).toEqual(terms.slice(0, MAX_QUERY_TERMS));
  });

  it('ignores stopwords when counting terms, and skips search when none remain', () => {
    expect(searchedQuery('how do I use the search')).toBe('search');
    const spy = vi.spyOn(MiniSearch.prototype, 'search');
    try {
      expect(searchLocalIndex(index, docs, 'how do I use the')).toEqual([]);
      expect(spy).not.toHaveBeenCalled();
    } finally {
      spy.mockRestore();
    }
  });

  it('only lets the first terms match as prefixes', () => {
    const prefixFlags: boolean[] = [];
    const search = MiniSearch.prototype.search;
    const spy = vi.spyOn(MiniSearch.prototype, 'search').mockImplementation(function (
      this: LocalSearchIndex,
      query,
      options
    ) {
      const prefix = (options as { prefix: (t: string, i: number) => boolean }).prefix;
      String(query)
        .split(' ')
        .forEach((term, i) => prefixFlags.push(prefix(term, i)));
      return search.call(this, query, options);
    });
    try {
      const terms = Array.from({ length: MAX_QUERY_TERMS }, (_, i) => `word${i}`);
      searchLocalIndex(index, docs, terms.join(' '));
    } finally {
      spy.mockRestore();
    }
    expect(prefixFlags.filter(Boolean).length).toBe(8);
    expect(prefixFlags.slice(0, 8).every(Boolean)).toBe(true);
  });

  it('keeps a 10 KB repetitive query cheap', () => {
    // Uncapped, this took over a second (and about 1 GB) on 1000 pages.
    const start = performance.now();
    searchLocalIndex(index, docs, 'kal '.repeat(2500));
    expect(performance.now() - start).toBeLessThan(100);
  });
});
