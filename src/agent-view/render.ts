/**
 * The one Markdown rendering of a document for agents. `docs_fetch` returns
 * it; anything else that serves a page to agents (such as a static `.md`
 * copy) should use it too, so a page reads the same however an agent got it.
 *
 * Edge-safe: runs in the MCP server.
 */

import type { ProcessedDoc } from '../types/index.js';

/** A document as agents read it: title, description, contents, then the page. */
export function renderDocument(doc: ProcessedDoc): string {
  const lines: string[] = [];

  lines.push(`# ${doc.title}`);
  lines.push('');

  if (doc.description) {
    lines.push(`> ${doc.description}`);
    lines.push('');
  }

  // Table of contents, down to h3, when the page has headings
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

  lines.push(doc.markdown);

  return lines.join('\n');
}
