import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import { toString as mdastToString } from 'mdast-util-to-string';
import { toString as hastToString } from 'hast-util-to-string';
import type { Element, ElementContent } from 'hast';
import type { Nodes as MdastNodes } from 'mdast';
import type { DocHeading } from '../types/index.js';

/** A heading in the page's content HTML. */
export interface HtmlHeading {
  level: number;
  text: string;
  /** The element's `id`, the anchor the page links to */
  id?: string;
}

const markdownParser = unified().use(remarkParse).use(remarkGfm);

/** Heading text as a reader sees it: zero-width characters dropped, whitespace collapsed. */
function normalize(text: string): string {
  return text
    .replace(/[\u200b-\u200d\ufeff]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** The h1–h6 elements in `content`, in document order. */
export function htmlHeadings(content: Element): HtmlHeading[] {
  const headings: HtmlHeading[] = [];
  const walk = (node: ElementContent): void => {
    if (node.type !== 'element') return;
    const match = /^h([1-6])$/.exec(node.tagName);
    if (match) {
      const id = node.properties?.id;
      headings.push({
        level: Number(match[1]),
        text: normalize(hastToString(node)),
        ...(typeof id === 'string' && id ? { id } : {}),
      });
      return;
    }
    node.children.forEach(walk);
  };
  walk(content);
  return headings;
}

/**
 * The headings of a document's Markdown, with offsets into it.
 *
 * Headings, their levels, text, and offsets come from the Markdown itself
 * (parsed, so `#` lines inside code blocks are not headings). Each heading's
 * `id` is the anchor of the matching HTML heading (same level and text, in
 * order), so it links to the page; a heading with no match gets an id
 * generated from its text.
 */
export function extractHeadings(markdown: string, html: HtmlHeading[] = []): DocHeading[] {
  const found: Array<{ level: number; text: string; start: number }> = [];
  const walk = (node: MdastNodes): void => {
    if (node.type === 'heading') {
      found.push({
        level: node.depth,
        text: normalize(mdastToString(node)),
        start: node.position?.start.offset ?? 0,
      });
      return;
    }
    if ('children' in node) node.children.forEach(walk);
  };
  walk(markdownParser.parse(markdown));

  let next = 0;
  const headings: DocHeading[] = found.map(({ level, text, start }) => {
    const index = html.findIndex((h, i) => i >= next && h.level === level && h.text === text);
    let id: string | undefined;
    if (index !== -1) {
      next = index + 1;
      id = html[index]?.id;
    }
    return { level, text, id: id ?? generateHeadingId(text), startOffset: start, endOffset: -1 };
  });

  // Each section ends where the next heading at the same or a higher level starts.
  headings.forEach((current, i) => {
    const following = headings.slice(i + 1).find((h) => h.level <= current.level);
    current.endOffset = following ? following.startOffset : markdown.length;
  });
  return headings;
}

/** A URL-safe id from heading text (Docusaurus style), for headings without one. */
function generateHeadingId(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}
