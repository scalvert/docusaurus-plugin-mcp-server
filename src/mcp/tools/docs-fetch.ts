import * as z from 'zod';
import type { ProcessedDoc, SkillFile } from '../../types/index.js';
import type { Resolved } from '../resolve.js';
import { SKILL_URI_PREFIX } from '../skills.js';
import { READ_ONLY_ANNOTATIONS, runTool, type DocsToolModule } from './tool.js';

/**
 * Zod field shape for docs_fetch input parameters. A raw shape (not a
 * `z.object`) so callers can extend it; `docsFetchTool.inputSchema` wraps it.
 * The name is kept from 1.x for compatibility.
 *
 * Unchanged since 2.0 for custom tool registration, so it still requires an
 * absolute URL. The server registers a looser schema (see `servedTool`) that
 * also accepts root-relative paths and, when skills are served, `skill://`.
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

const SERVED_URL_DESCRIPTION =
  'The page to fetch: a URL from search results or a link in a fetched page (e.g., "https://docs.example.com/docs/getting-started" or "/docs/getting-started"). Add #heading-id to fetch one section';

/**
 * The description and schema the server registers. Any non-empty string: the
 * resolver handles root-relative paths and other forms of a document ID. With
 * skills, docs_fetch also reads `skill://` URIs, for hosts without the skills
 * extension.
 */
function servedTool(servesSkills: boolean) {
  const url = z.string().min(1);
  if (!servesSkills) {
    return {
      description: docsFetchTool.description,
      inputSchema: z.object({ url: url.describe(SERVED_URL_DESCRIPTION) }),
    };
  }
  return {
    description: `${docsFetchTool.description} Also reads Agent Skills: pass a skill:// URI from the server instructions.`,
    inputSchema: z.object({
      url: url.describe(
        `${SERVED_URL_DESCRIPTION}, or a skill:// URI from the server instructions`
      ),
    }),
  };
}

/**
 * The docs_fetch tool: resolves the URI, then formats what it names as Markdown.
 */
export const docsFetch: DocsToolModule = {
  name: 'docs_fetch',
  register(server, deps, overrides) {
    const tool = servedTool(deps.servesSkills);
    server.registerTool(
      docsFetchTool.name,
      {
        description: overrides?.docs_fetch?.description ?? tool.description,
        inputSchema: tool.inputSchema,
        annotations: READ_ONLY_ANNOTATIONS,
      },
      ({ url }) =>
        runTool(
          deps,
          '[MCP] Fetch error:',
          'An error occurred while fetching the page. Please try again.',
          async () => formatResolved(await deps.resolve(url), deps.servesSkills)
        )
    );
  },
};

/** What docs_fetch returns for a resolved URI. */
export function formatResolved(resolved: Resolved, servesSkills: boolean): string {
  switch (resolved.kind) {
    case 'skill-file':
      return formatSkillFile(resolved.uri, resolved.file);
    case 'document':
      return resolved.fragment === undefined
        ? formatPageContent(resolved.doc)
        : formatSection(resolved.id, resolved.doc, resolved.fragment);
    case 'not-found':
      return servesSkills && resolved.tried.startsWith(SKILL_URI_PREFIX)
        ? formatSkillFile(resolved.tried, null)
        : formatNotFound(resolved);
  }
}

/**
 * One section of a page, for a URI with a fragment: from the heading with
 * that ID to the next heading at the same or a higher level. A fragment that
 * matches no heading gets the whole page, with a note.
 */
export function formatSection(id: string, doc: ProcessedDoc, fragment: string): string {
  const heading = doc.headings.find((h) => h.id === fragment);
  if (!heading) {
    return `> No section #${fragment} on this page; showing the whole page.\n\n${formatPageContent(doc)}`;
  }
  return [
    `# ${doc.title}: ${heading.text}`,
    '',
    `> Section #${fragment} of ${id}. Fetch the URL without #${fragment} for the whole page.`,
    '',
    doc.markdown.slice(heading.startOffset, heading.endOffset).trim(),
    '',
  ].join('\n');
}

/** A miss: the canonical URL tried, pages with a similar path, and what to do next. */
export function formatNotFound(resolved: Extract<Resolved, { kind: 'not-found' }>): string {
  const lines = [`Page not found: ${resolved.tried}`];
  if (resolved.similar.length > 0) {
    lines.push('Pages with a similar path:');
    for (const page of resolved.similar) {
      lines.push(page.title ? `- ${page.id} (${page.title})` : `- ${page.id}`);
    }
    lines.push('Or search with docs_search and fetch a URL from its results.');
  } else {
    lines.push('Search with docs_search and fetch a URL from its results.');
  }
  return lines.join('\n');
}

/**
 * A skill file as docs_fetch returns it: the file's text exactly as
 * resources/read serves it (SKILL.md keeps its frontmatter).
 */
export function formatSkillFile(uri: string, file: SkillFile | null): string {
  if (!file) {
    return `Skill file not found: ${uri}. Use a skill:// URI listed in the server instructions, or a file a skill links to.`;
  }
  if (file.text !== undefined) {
    return file.text;
  }
  return `${uri} is a binary file (${file.mimeType}, ${file.size} bytes). Read it with resources/read.`;
}

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
