import type { DocHeading } from '../types/index.js';

/**
 * Extract headings from markdown content with their positions
 */
export function extractHeadingsFromMarkdown(markdown: string): DocHeading[] {
  const headings: DocHeading[] = [];
  const lines = markdown.split('\n');
  let currentOffset = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? '';
    const headingMatch = line.match(/^(#{1,6})\s+(.+?)(?:\s+\{#([^}]+)\})?$/);

    if (headingMatch) {
      const hashes = headingMatch[1] ?? '';
      const level = hashes.length;
      let text = headingMatch[2] ?? '';
      let id = headingMatch[3] ?? '';

      // If no explicit ID, generate one from text (Docusaurus style)
      if (!id) {
        id = generateHeadingId(text);
      }

      // Clean up text (remove any remaining markdown formatting)
      text = text.replace(/\*\*([^*]+)\*\*/g, '$1'); // Remove bold
      text = text.replace(/_([^_]+)_/g, '$1'); // Remove italic
      text = text.replace(/`([^`]+)`/g, '$1'); // Remove code

      headings.push({
        level,
        text: text.trim(),
        id,
        startOffset: currentOffset,
        endOffset: -1, // Will be calculated below
      });
    }

    currentOffset += line.length + 1; // +1 for newline
  }

  // Calculate end offsets (each heading ends where the next same-or-higher level heading starts)
  for (let i = 0; i < headings.length; i++) {
    const current = headings[i];
    if (!current) continue;

    let endOffset = markdown.length;

    // Find the next heading at the same or higher level
    for (let j = i + 1; j < headings.length; j++) {
      const next = headings[j];
      if (next && next.level <= current.level) {
        endOffset = next.startOffset;
        break;
      }
    }

    current.endOffset = endOffset;
  }

  return headings;
}

/**
 * Generate a URL-safe heading ID (Docusaurus style)
 */
export function generateHeadingId(text: string): string {
  return (
    text
      .toLowerCase()
      // Remove any non-alphanumeric characters except spaces and hyphens
      .replace(/[^\w\s-]/g, '')
      // Replace spaces with hyphens
      .replace(/\s+/g, '-')
      // Remove consecutive hyphens
      .replace(/-+/g, '-')
      // Remove leading/trailing hyphens
      .replace(/^-|-$/g, '')
  );
}

/**
 * Extract a specific section from markdown by heading ID
 */
export function extractSection(
  markdown: string,
  headingId: string,
  headings: DocHeading[]
): string | null {
  const heading = headings.find((h) => h.id === headingId);

  if (!heading) {
    return null;
  }

  return markdown.slice(heading.startOffset, heading.endOffset).trim();
}
