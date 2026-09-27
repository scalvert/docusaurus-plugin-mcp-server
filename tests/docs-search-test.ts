import { describe, it, expect } from 'vitest';
import { formatSearchResults } from '../src/mcp/tools/docs-search.js';
import { buildLocalSearchIndex, documentId, searchLocalIndex } from '../src/search/local-search.js';
import type { ProcessedDoc } from '../src/types/index.js';

describe('searchLocalIndex', () => {
  const sampleDocsArray: ProcessedDoc[] = [
    {
      route: '/guides/getting-started',
      title: 'Getting Started Guide',
      description: 'Learn how to get started with the platform.',
      markdown:
        '# Getting Started\n\nWelcome to the getting started guide.\n\n## Installation\n\nRun npm install to begin.',
      headings: [
        { level: 1, text: 'Getting Started', id: 'getting-started', startOffset: 0, endOffset: 50 },
        { level: 2, text: 'Installation', id: 'installation', startOffset: 51, endOffset: 100 },
      ],
    },
    {
      route: '/api/authentication',
      title: 'Authentication API',
      description: 'API reference for authentication endpoints.',
      markdown:
        '# Authentication\n\nLearn about OAuth and API keys.\n\n## OAuth 2.0\n\nUse OAuth for secure access.',
      headings: [
        { level: 1, text: 'Authentication', id: 'authentication', startOffset: 0, endOffset: 50 },
        { level: 2, text: 'OAuth 2.0', id: 'oauth-20', startOffset: 51, endOffset: 100 },
      ],
    },
    {
      route: '/guides/advanced',
      title: 'Advanced Topics',
      description: 'Advanced usage patterns and best practices.',
      markdown:
        '# Advanced Topics\n\nAdvanced configuration and optimization.\n\n## Performance\n\nOptimize your setup.',
      headings: [
        { level: 1, text: 'Advanced Topics', id: 'advanced-topics', startOffset: 0, endOffset: 50 },
        { level: 2, text: 'Performance', id: 'performance', startOffset: 51, endOffset: 100 },
      ],
    },
  ];

  const BASE_URL = 'https://docs.example.com';
  const sampleDocs = Object.fromEntries(
    sampleDocsArray.map((doc) => [documentId(doc, BASE_URL), doc])
  );
  const index = buildLocalSearchIndex(sampleDocsArray, BASE_URL);
  const search = (query: string, limit?: number) =>
    searchLocalIndex(index, sampleDocs, query, { limit });

  it('finds documents matching query', () => {
    const results = search('getting started');

    expect(results[0]?.url).toBe(`${BASE_URL}/guides/getting-started`);
    expect(results[0]?.route).toBe('/guides/getting-started');
  });

  it('finds documents by content keywords', () => {
    const results = search('OAuth');

    expect(results.some((r) => r.url === `${BASE_URL}/api/authentication`)).toBe(true);
  });

  it('respects limit parameter', () => {
    expect(search('guide', 1).length).toBeLessThanOrEqual(1);
  });

  it('returns empty array for no matches', () => {
    expect(search('xyznonexistent12345')).toEqual([]);
  });

  it('returns nothing for a limit of 0', () => {
    expect(search('guide', 0)).toEqual([]);
  });

  it('includes a snippet and matching headings', () => {
    const [first] = search('installation');

    expect(first?.snippet).toContain('install');
    expect(first?.matchingHeadings).toContain('Installation');
  });

  it('does not list headings that only share a stopword with the query', () => {
    const auth = search('how do I use OAuth').find((r) => r.route === '/api/authentication');

    // "Authentication" shares no word with the query; only "OAuth 2.0" does.
    expect(auth?.matchingHeadings).toEqual(['OAuth 2.0']);
  });

  it('matches headings by stem, so a plural query finds a singular heading', () => {
    // "installations" is not a substring of "Installation"; only stems match.
    const hit = search('installations').find((r) => r.route === '/guides/getting-started');

    expect(hit?.matchingHeadings).toEqual(['Installation']);
  });

  it('does not let a 1-2 letter word prefix-match unrelated terms', () => {
    // "op" would prefix-match "optimization" and "optimize" if short prefixes were allowed.
    expect(search('op').map((r) => r.route)).toEqual([]);
  });

  it('folds accents so unaccented queries match accented text', () => {
    // Routes carry none of the query words, so only the accented text can
    // match. Accents in the middle of a word must not split it.
    const docs: ProcessedDoc[] = [
      {
        route: '/a',
        title: 'Menu',
        description: '',
        markdown: 'Our café serves lunch.',
        headings: [],
      },
      {
        route: '/b',
        title: 'Guide',
        description: '',
        markdown: 'Déploiement rapide.',
        headings: [],
      },
      { route: '/c', title: 'Keys', description: '', markdown: 'Der Schlüssel.', headings: [] },
    ];
    const idx = buildLocalSearchIndex(docs, BASE_URL);
    const byId = Object.fromEntries(docs.map((d) => [documentId(d, BASE_URL), d]));
    const top = (q: string) => searchLocalIndex(idx, byId, q)[0]?.route;

    expect(top('cafe')).toBe('/a');
    expect(top('deploiement')).toBe('/b');
    expect(top('schlussel')).toBe('/c');
  });

  it('anchors the snippet on a stemmed match, not the start of the page', () => {
    // The only form of the query word is "route", well past the first 200
    // characters, so an unstemmed snippet would fall back to the page start.
    const doc: ProcessedDoc = {
      route: '/concepts',
      title: 'Concepts',
      description: '',
      markdown: `${'Background material. '.repeat(20)}Each route maps a path to a handler.`,
      headings: [],
    };
    const idx = buildLocalSearchIndex([doc], BASE_URL);
    const [hit] = searchLocalIndex(idx, { [documentId(doc, BASE_URL)]: doc }, 'routes');

    expect(hit?.snippet).toContain('Each route maps a path');
  });

  it('highlights prefix matches in the snippet and headings, as search ranks them', () => {
    const doc: ProcessedDoc = {
      route: '/security',
      title: 'Security',
      description: '',
      markdown: `${'Overview text. '.repeat(20)}## Authentication\n\nSign in with OAuth.`,
      headings: [
        {
          level: 2,
          text: 'Authentication',
          id: 'authentication',
          startOffset: 300,
          endOffset: 318,
        },
      ],
    };
    const idx = buildLocalSearchIndex([doc], BASE_URL);
    const [hit] = searchLocalIndex(idx, { [documentId(doc, BASE_URL)]: doc }, 'auth');

    expect(hit?.matchingHeadings).toEqual(['Authentication']);
    expect(hit?.snippet).toContain('Authentication');
  });
});

describe('formatSearchResults', () => {
  it('formats results with URL prominently displayed', () => {
    const results = [
      {
        url: 'https://docs.example.com/guides/getting-started',
        route: '/guides/getting-started',
        title: 'Getting Started',
        score: 1.0,
        snippet: 'Learn how to get started...',
        matchingHeadings: ['Installation'],
      },
    ];

    const formatted = formatSearchResults(results);

    expect(formatted).toContain('URL: https://docs.example.com/guides/getting-started');
    expect(formatted).toContain('**Getting Started**');
    expect(formatted).toContain('Matching sections: Installation');
    expect(formatted).toContain('Use docs_fetch with the URL');
  });

  it('handles empty results', () => {
    const formatted = formatSearchResults([]);
    expect(formatted).toBe('No matching documents found.');
  });

  it('handles results without matching headings', () => {
    const results = [
      {
        url: 'https://docs.example.com/guides/test',
        route: '/guides/test',
        title: 'Test',
        score: 1.0,
        snippet: 'Test content',
      },
    ];

    const formatted = formatSearchResults(results);

    expect(formatted).toContain('URL: https://docs.example.com/guides/test');
    expect(formatted).toContain('**Test**');
    expect(formatted).not.toContain('Matching sections');
  });
});
