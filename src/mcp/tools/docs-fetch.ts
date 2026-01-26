import type { ProcessedDoc, DocsGetPageParams } from '../../types/index.js';

/**
 * Tool definition for docs_fetch
 */
export const docsFetchTool = {
  name: 'docs_fetch',
  description:
    'Fetch the complete content of a documentation page. Use this after searching to get full page content.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      route: {
        type: 'string',
        description: 'The route path of the page (e.g., /docs/getting-started)',
      },
    },
    required: ['route'],
  },
};

/**
 * Execute the docs_get_page tool
 */
export function executeDocsGetPage(
  params: DocsGetPageParams,
  docs: Record<string, ProcessedDoc>
): ProcessedDoc | null {
  const { route } = params;

  // Validate parameters
  if (!route || typeof route !== 'string') {
    throw new Error('Route parameter is required and must be a string');
  }

  // Normalize route (ensure leading slash, remove trailing slash)
  let normalizedRoute = route.trim();
  if (!normalizedRoute.startsWith('/')) {
    normalizedRoute = '/' + normalizedRoute;
  }
  if (normalizedRoute.length > 1 && normalizedRoute.endsWith('/')) {
    normalizedRoute = normalizedRoute.slice(0, -1);
  }

  // Look up the document
  const doc = docs[normalizedRoute];

  if (!doc) {
    // Try without leading slash
    const altRoute = normalizedRoute.slice(1);
    if (docs[altRoute]) {
      return docs[altRoute] ?? null;
    }
    return null;
  }

  return doc;
}

/**
 * Format page content for MCP response
 */
export function formatPageContent(doc: ProcessedDoc | null, baseUrl?: string): string {
  if (!doc) {
    return 'Page not found. Please check the route path and try again.';
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

  // Include full URL if baseUrl is provided
  if (baseUrl) {
    const fullUrl = `${baseUrl.replace(/\/$/, '')}${doc.route}`;
    lines.push(`**URL:** ${fullUrl}`);
  }

  lines.push(`**Route:** ${doc.route}`);
  lines.push('');

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
