import { describe, it, expect } from 'vitest';
import { executeDocsSearch, formatSearchResults } from '../src/mcp/tools/docs-search.js';
import { buildSearchIndex } from '../src/search/flexsearch-indexer.js';
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

  // Convert to Record for lookups
  const sampleDocs: Record<string, ProcessedDoc> = {};
  for (const doc of sampleDocsArray) {
    sampleDocs[doc.route] = doc;
  }

  // Build search index from array
  const searchIndex = buildSearchIndex(sampleDocsArray);

  it('finds documents matching query', () => {
    const results = executeDocsSearch({ query: 'getting started' }, searchIndex, sampleDocs);

    expect(results.length).toBeGreaterThan(0);
    expect(results.some((r) => r.route === '/guides/getting-started')).toBe(true);
  });

  it('finds documents by content keywords', () => {
    const results = executeDocsSearch({ query: 'OAuth' }, searchIndex, sampleDocs);

    expect(results.length).toBeGreaterThan(0);
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
  it('formats results with URLs when baseUrl provided', () => {
    const results = [
      {
        route: '/guides/getting-started',
        title: 'Getting Started',
        score: 1.0,
        snippet: 'Learn how to get started...',
        matchingHeadings: ['Installation'],
      },
    ];

    const formatted = formatSearchResults(results, 'https://docs.example.com');

    expect(formatted).toContain('URL: https://docs.example.com/guides/getting-started');
    expect(formatted).toContain('**Getting Started**');
    expect(formatted).toContain('Route: /guides/getting-started');
    expect(formatted).toContain('Matching sections: Installation');
  });

  it('formats results without URLs when baseUrl not provided', () => {
    const results = [
      {
        route: '/guides/getting-started',
        title: 'Getting Started',
        score: 1.0,
        snippet: 'Learn how to get started...',
      },
    ];

    const formatted = formatSearchResults(results);

    expect(formatted).not.toContain('URL:');
    expect(formatted).toContain('Route: /guides/getting-started');
  });

  it('handles empty results', () => {
    const formatted = formatSearchResults([]);
    expect(formatted).toBe('No matching documents found.');
  });

  it('strips trailing slash from baseUrl', () => {
    const results = [
      {
        route: '/guides/test',
        title: 'Test',
        score: 1.0,
        snippet: 'Test content',
      },
    ];

    const formatted = formatSearchResults(results, 'https://docs.example.com/');

    expect(formatted).toContain('URL: https://docs.example.com/guides/test');
    expect(formatted).not.toContain('https://docs.example.com//');
  });
});
