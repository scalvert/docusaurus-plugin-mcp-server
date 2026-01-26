import { z } from 'zod';
import type { ProcessedDoc, SearchResult, DocsSearchParams } from '../../types/index.js';
import { searchIndex, type FlexSearchDocument } from '../../search/flexsearch-core.js';

/**
 * Zod schema for docs_search input parameters
 */
export const docsSearchInputSchema = {
  query: z.string().min(1).describe('The search query string'),
  limit: z
    .number()
    .int()
    .min(1)
    .max(20)
    .optional()
    .default(5)
    .describe('Maximum number of results to return (1-20, default: 5)'),
};

/**
 * Tool definition for docs_search
 */
export const docsSearchTool = {
  name: 'docs_search',
  description:
    'Search the documentation for relevant pages. Returns matching documents with URLs, snippets, and relevance scores. Use this to find information across all documentation.',
  inputSchema: docsSearchInputSchema,
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
