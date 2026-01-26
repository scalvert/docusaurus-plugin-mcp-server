import { describe, it, expect } from 'vitest';
import { executeDocsSearch, formatSearchResults } from '../src/mcp/tools/docs-search.js';
import { buildSearchIndex } from '../src/search/flexsearch-core.js';
import type { ProcessedDoc } from '../src/types/index.js';

describe('executeDocsSearch', () => {
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

  // Convert to Record for lookups (keyed by full URL)
  const sampleDocs: Record<string, ProcessedDoc> = {};
  for (const doc of sampleDocsArray) {
    const fullUrl = `${BASE_URL}${doc.route}`;
    sampleDocs[fullUrl] = doc;
  }

  // Build search index from array with baseUrl
  const searchIndex = buildSearchIndex(sampleDocsArray, BASE_URL);

  it('finds documents matching query', () => {
    const results = executeDocsSearch({ query: 'getting started' }, searchIndex, sampleDocs);

    expect(results.length).toBeGreaterThan(0);
    expect(results.some((r) => r.url === `${BASE_URL}/guides/getting-started`)).toBe(true);
    expect(results.some((r) => r.route === '/guides/getting-started')).toBe(true);
  });

  it('finds documents by content keywords', () => {
    const results = executeDocsSearch({ query: 'OAuth' }, searchIndex, sampleDocs);

    expect(results.length).toBeGreaterThan(0);
    expect(results.some((r) => r.url === `${BASE_URL}/api/authentication`)).toBe(true);
    expect(results.some((r) => r.route === '/api/authentication')).toBe(true);
  });

  it('respects limit parameter', () => {
    const results = executeDocsSearch({ query: 'guide', limit: 1 }, searchIndex, sampleDocs);

    expect(results.length).toBeLessThanOrEqual(1);
  });

  it('throws error for empty query', () => {
    expect(() => executeDocsSearch({ query: '' }, searchIndex, sampleDocs)).toThrow(
      'Query parameter is required'
    );
  });

  it('returns empty array for no matches', () => {
    const results = executeDocsSearch({ query: 'xyznonexistent12345' }, searchIndex, sampleDocs);

    expect(results).toEqual([]);
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
