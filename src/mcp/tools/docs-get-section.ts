import type { ProcessedDoc, DocsGetSectionParams } from '../../types/index.js';
import { extractSection } from '../../processing/heading-extractor.js';

/**
 * Tool definition for docs_get_section
 */
export const docsGetSectionTool = {
  name: 'docs_get_section',
  description:
    'Retrieve a specific section of a documentation page by heading ID. Use this to get focused content from a larger page.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      route: {
        type: 'string',
        description: 'The route path of the page (e.g., /docs/getting-started)',
      },
      headingId: {
        type: 'string',
        description: 'The ID of the heading to retrieve (e.g., authentication)',
      },
    },
    required: ['route', 'headingId'],
  },
};

/**
 * Result of executing docs_get_section
 */
export interface SectionResult {
  /** The section content as markdown */
  content: string | null;
  /** The document the section belongs to */
  doc: ProcessedDoc | null;
  /** The heading text */
  headingText: string | null;
  /** Available headings in the document */
  availableHeadings: Array<{ id: string; text: string; level: number }>;
}

/**
 * Execute the docs_get_section tool
 */
export function executeDocsGetSection(
  params: DocsGetSectionParams,
  docs: Record<string, ProcessedDoc>
): SectionResult {
  const { route, headingId } = params;

  // Validate parameters
  if (!route || typeof route !== 'string') {
    throw new Error('Route parameter is required and must be a string');
  }
  if (!headingId || typeof headingId !== 'string') {
    throw new Error('HeadingId parameter is required and must be a string');
  }

  // Normalize route
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
    return {
      content: null,
      doc: null,
      headingText: null,
      availableHeadings: [],
    };
  }

  // Get available headings
  const availableHeadings = doc.headings.map((h) => ({
    id: h.id,
    text: h.text,
    level: h.level,
  }));

  // Find the heading
  const heading = doc.headings.find((h) => h.id === headingId.trim());

  if (!heading) {
    return {
      content: null,
      doc,
      headingText: null,
      availableHeadings,
    };
  }

  // Extract the section content
  const content = extractSection(doc.markdown, headingId.trim(), doc.headings);

  return {
    content,
    doc,
    headingText: heading.text,
    availableHeadings,
  };
}

/**
 * Format section content for MCP response
 */
export function formatSectionContent(
  result: SectionResult,
  headingId: string,
  baseUrl?: string
): string {
  if (!result.doc) {
    return 'Page not found. Please check the route path and try again.';
  }

  if (!result.content) {
    const lines = [`Section "${headingId}" not found in this document.`, '', 'Available sections:'];

    for (const heading of result.availableHeadings) {
      const indent = '  '.repeat(heading.level - 1);
      lines.push(`${indent}- ${heading.text} (id: ${heading.id})`);
    }

    return lines.join('\n');
  }

  const lines: string[] = [];

  // Build URL with anchor if baseUrl is provided
  const fullUrl = baseUrl ? `${baseUrl.replace(/\/$/, '')}${result.doc.route}#${headingId}` : null;

  // Header
  lines.push(`# ${result.headingText}`);
  if (fullUrl) {
    lines.push(`> From: ${result.doc.title} - ${fullUrl}`);
  } else {
    lines.push(`> From: ${result.doc.title} (${result.doc.route})`);
  }
  lines.push('');
  lines.push('---');
  lines.push('');

  // Section content
  lines.push(result.content);

  return lines.join('\n');
}
