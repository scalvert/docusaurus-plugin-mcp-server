import type { ProcessedDoc, SearchResult, DocsSearchParams } from '../../types/index.js';
import { searchIndex, type FlexSearchDocument } from '../../search/flexsearch-indexer.js';

/**
 * Tool definition for docs_search
 */
export const docsSearchTool = {
  name: 'docs_search',
  description:
    'Search across developer documentation. Returns ranked results with snippets and matching headings.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      query: {
        type: 'string',
        description: 'Search query string',
      },
      limit: {
        type: 'number',
        description: 'Maximum number of results to return (default: 5, max: 20)',
        default: 5,
      },
    },
    required: ['query'],
  },
};

/**
 * Execute the docs_search tool
 */
export function executeDocsSearch(
  params: DocsSearchParams,
  index: FlexSearchDocument,
  docs: Record<string, ProcessedDoc>
): SearchResult[] {
  const { query, limit = 5 } = params;

  // Validate parameters
  if (!query || typeof query !== 'string' || query.trim().length === 0) {
    throw new Error('Query parameter is required and must be a non-empty string');
  }

  const effectiveLimit = Math.min(Math.max(1, limit), 20);

  // Search the index
  const results = searchIndex(index, docs, query.trim(), {
    limit: effectiveLimit,
  });

  return results;
}

/**
 * Format search results for MCP response
 */
export function formatSearchResults(results: SearchResult[]): string {
  if (results.length === 0) {
    return 'No matching documents found.';
  }

  const lines: string[] = [`Found ${results.length} result(s):\n`];

  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    if (!result) continue;

    lines.push(`${i + 1}. **${result.title}**`);
    lines.push(`   URL: ${result.url}`);

    if (result.matchingHeadings && result.matchingHeadings.length > 0) {
      lines.push(`   Matching sections: ${result.matchingHeadings.join(', ')}`);
    }

    lines.push(`   ${result.snippet}`);
    lines.push('');
  }

  lines.push('Use docs_fetch with the URL to retrieve the full page content.');

  return lines.join('\n');
}
