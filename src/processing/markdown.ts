import { unified } from 'unified';
import rehypeRemark from 'rehype-remark';
import remarkGfm from 'remark-gfm';
import remarkStringify from 'remark-stringify';
import { toHtml } from 'hast-util-to-html';
import { toString } from 'hast-util-to-string';
import type { Element, Root } from 'hast';

const processor = unified()
  .use(rehypeRemark)
  .use(remarkGfm)
  .use(remarkStringify, { bullet: '-', fences: true });

/**
 * Convert a page's content element to Markdown, straight from the parsed
 * tree (no second HTML parse). If conversion fails, falls back to plain text.
 */
export async function hastToMarkdown(element: Element): Promise<string> {
  const root: Root = { type: 'root', children: [normalizeCodeBlocks(element)] };
  try {
    const mdast = await processor.run(root);
    return cleanMarkdown(String(processor.stringify(mdast)));
  } catch (error) {
    console.error('Error converting HTML to Markdown:', error);
    return extractTextFallback(toHtml(element));
  }
}

function classesOf(node: Element): string[] {
  const value = node.properties?.className;
  return Array.isArray(value)
    ? value.map(String)
    : typeof value === 'string'
      ? value.split(/\s+/)
      : [];
}

function tokenLines(node: Element): Element[] {
  const lines: Element[] = [];
  for (const child of node.children) {
    if (child.type !== 'element') continue;
    if (classesOf(child).includes('token-line')) lines.push(child);
    else lines.push(...tokenLines(child));
  }
  return lines;
}

/**
 * Docusaurus (Prism) code blocks put each line in its own `.token-line`
 * element ending in `<br>` (a `span` before Docusaurus 3.8, a `div` since),
 * and the language in a `language-*` class on the `<pre>`. Rebuild each as
 * `<pre><code class="language-*">` plain text, so the Markdown keeps one line
 * per line (a `div` per line would otherwise become blank-line-separated
 * blocks) and the fence gets its language. Other `<pre>`s are left alone.
 */
function normalizeCodeBlocks(node: Element): Element {
  if (node.tagName === 'pre') {
    const language = classesOf(node).find((name) => name.startsWith('language-'));
    const lines = tokenLines(node);
    if (!language && lines.length === 0) return node;
    const text = lines.length > 0 ? lines.map((line) => toString(line)).join('\n') : toString(node);
    return {
      type: 'element',
      tagName: 'pre',
      properties: {},
      children: [
        {
          type: 'element',
          tagName: 'code',
          properties: language ? { className: [language] } : {},
          children: [{ type: 'text', value: text.replace(/\n+$/, '') }],
        },
      ],
    };
  }
  return {
    ...node,
    children: node.children.map((child) =>
      child.type === 'element' ? normalizeCodeBlocks(child) : child
    ),
  };
}

/** Collapse blank-line runs and trailing whitespace; end with one newline. */
function cleanMarkdown(markdown: string): string {
  return (
    markdown
      .replace(/\n{3,}/g, '\n\n')
      .split('\n')
      .map((line) => line.trimEnd())
      .join('\n')
      .trim() + '\n'
  );
}

/** Plain text from HTML, for when Markdown conversion fails. */
function extractTextFallback(html: string): string {
  let text = html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');
  text = text.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');

  text = text.replace(/<br\s*\/?>/gi, '\n');
  text = text.replace(/<\/p>/gi, '\n\n');
  text = text.replace(/<\/h[1-6]>/gi, '\n\n');
  text = text.replace(/<\/li>/gi, '\n');
  text = text.replace(/<\/div>/gi, '\n');
  text = text.replace(/<[^>]+>/g, '');

  text = text.replace(/&nbsp;/g, ' ');
  text = text.replace(/&amp;/g, '&');
  text = text.replace(/&lt;/g, '<');
  text = text.replace(/&gt;/g, '>');
  text = text.replace(/&quot;/g, '"');
  text = text.replace(/&#39;/g, "'");

  text = text.replace(/[ \t]+/g, ' ');
  text = text.replace(/\n{3,}/g, '\n\n');
  return text.trim();
}
