import * as z from 'zod';
import type { ProcessedDoc } from '../../types/index.js';
import { READ_ONLY_ANNOTATIONS, runTool, type DocsToolModule } from './tool.js';

/**
 * Zod field shape for docs_fetch input parameters. A raw shape (not a
 * `z.object`) so callers can extend it; `docsFetchTool.inputSchema` wraps it.
 * The name is kept from 1.x for compatibility.
 */
export const docsFetchInputSchema = {
  url: z
    .string()
    .url()
    .describe(
      'The full URL of the page to fetch (e.g., "https://docs.example.com/docs/getting-started")'
    ),
};

/**
 * Tool definition for docs_fetch
 */
export const docsFetchTool = {
  name: 'docs_fetch',
  description:
    'Fetch the complete content of a documentation page. Use this after searching to get the full markdown content of a specific page.',
  inputSchema: z.object(docsFetchInputSchema),
};

/**
 * The docs_fetch tool: fetches one page and formats it as Markdown.
 */
export const docsFetch: DocsToolModule = {
  name: 'docs_fetch',
  register(server, deps, overrides) {
    server.registerTool(
      docsFetchTool.name,
      {
        description: overrides?.docs_fetch?.description ?? docsFetchTool.description,
        inputSchema: docsFetchTool.inputSchema,
        annotations: READ_ONLY_ANNOTATIONS,
      },
      ({ url }) =>
        runTool(
          deps,
          '[MCP] Fetch error:',
          'An error occurred while fetching the page. Please try again.',
          async () => formatPageContent(await deps.getDocument(url))
        )
    );
  },
};

/**
 * Format page content for MCP response
 */
export function formatPageContent(doc: ProcessedDoc | null): string {
  if (!doc) {
    return 'Page not found. Please check the URL and try again.';
  }

  const lines: string[] = [];

  // Header
  lines.push(`# ${doc.title}`);
  lines.push('');

  // Metadata
  if (doc.description) {
    lines.push(`> ${doc.description}`);
    lines.push('');
  }

  // Table of contents (if there are headings)
  if (doc.headings.length > 0) {
    lines.push('## Contents');
    lines.push('');
    for (const heading of doc.headings) {
      if (heading.level <= 3) {
        const indent = '  '.repeat(heading.level - 1);
        lines.push(`${indent}- [${heading.text}](#${heading.id})`);
      }
    }
    lines.push('');
    lines.push('---');
    lines.push('');
  }

  // Main content
  lines.push(doc.markdown);

  return lines.join('\n');
}
