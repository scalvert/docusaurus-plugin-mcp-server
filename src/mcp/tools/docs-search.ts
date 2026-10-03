import * as z from 'zod';
import type { SearchResult } from '../../types/index.js';
import { READ_ONLY_ANNOTATIONS, runTool, type DocsToolModule } from './tool.js';

/**
 * Longest accepted query. Search also caps the terms it uses (see
 * MAX_QUERY_TERMS in search/local-search.ts); this bounds the request itself.
 */
export const MAX_QUERY_LENGTH = 500;

/**
 * Zod field shape for docs_search input parameters. A raw shape (not a
 * `z.object`) so callers can extend it; `docsSearchTool.inputSchema` wraps it.
 * The name is kept from 1.x for compatibility.
 */
export const docsSearchInputSchema = {
  query: z
    .string()
    .min(1)
    .max(MAX_QUERY_LENGTH)
    .describe(`A few search keywords (max ${MAX_QUERY_LENGTH} characters)`),
  limit: z
    .number()
    .int()
    .min(1)
    .max(20)
    .optional()
    .default(16)
    .describe('Maximum number of results to return (1-20, default: 16)'),
};

/**
 * Tool definition for docs_search
 */
export const docsSearchTool = {
  name: 'docs_search',
  description:
    'Search the documentation for relevant pages. Returns matching documents ranked by relevance, with URLs, snippets, and matching sections. Use this to find information across all documentation.',
  inputSchema: z.object(docsSearchInputSchema),
};

/**
 * The docs_search tool: searches through the provider and formats the results.
 */
export const docsSearch: DocsToolModule = {
  name: 'docs_search',
  register(server, deps, overrides) {
    server.registerTool(
      docsSearchTool.name,
      {
        description: overrides?.docs_search?.description ?? docsSearchTool.description,
        inputSchema: docsSearchTool.inputSchema,
        annotations: READ_ONLY_ANNOTATIONS,
      },
      ({ query, limit }) =>
        runTool(
          deps,
          '[MCP] Search error:',
          'An error occurred while searching. Please try again.',
          async () => formatSearchResults(await deps.search(query, { limit }))
        )
    );
  },
};

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
