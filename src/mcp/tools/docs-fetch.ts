import { z } from 'zod';
import type { ProcessedDoc } from '../../types/index.js';

/**
 * Zod schema for docs_fetch input parameters
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
  inputSchema: docsFetchInputSchema,
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
