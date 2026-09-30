/**
 * Page extraction: a Docusaurus build directory in, documents out.
 *
 * Each page is parsed once. The title and description come from the whole
 * page; the content element (the first content selector with real text, else
 * `<body>`) is cleaned of excluded elements and converted straight from the
 * tree to Markdown; headings come from that Markdown.
 */

import fs from 'node:fs/promises';
import pMap from 'p-map';
import { unified } from 'unified';
import rehypeParse from 'rehype-parse';
import { select } from 'hast-util-select';
import { toString } from 'hast-util-to-string';
import type { Element, Root } from 'hast';
import type { ProcessedDoc } from '../types/index.js';
import { discoverPages } from './pages.js';
import { hastToMarkdown } from './markdown.js';
import { extractHeadingsFromMarkdown } from './headings.js';

export interface PageOptions {
  /** CSS selectors for the content container, in priority order */
  contentSelectors: string[];
  /** Selectors for elements to drop from the content */
  excludeSelectors: string[];
  /** Pages with less Markdown than this (in characters) are skipped */
  minContentLength: number;
}

export interface ExtractDocsOptions extends PageOptions {
  /** Route globs (`*`, `?`) to skip, e.g. `/404*` */
  excludeRoutes: string[];
}

/** Why a page produced no document. */
export type SkipReason = 'no-content' | 'too-short';

export interface ExtractDocsResult {
  /** One document per page kept, in discovery order */
  docs: ProcessedDoc[];
  /** How many pages were found (before skipping) */
  pageCount: number;
}

const htmlParser = unified().use(rehypeParse);

/**
 * Extract a document from every page in a build directory. Pages that fail
 * or are skipped are logged and left out; they never fail the build.
 * Progress is logged with the `[MCP]` prefix.
 */
export async function extractDocs(
  outDir: string,
  options: ExtractDocsOptions
): Promise<ExtractDocsResult> {
  const pages = await discoverPages(outDir, options.excludeRoutes);
  console.log(`[MCP] Found ${pages.length} routes to process`);
  if (pages.length === 0) {
    console.warn('[MCP] No routes found to process');
    return { docs: [], pageCount: 0 };
  }

  const results = await pMap(
    pages,
    async ({ route, htmlPath }) => {
      try {
        const result = await extractPage(await fs.readFile(htmlPath, 'utf-8'), route, options);
        if ('skipped' in result) {
          console.warn(
            result.skipped === 'no-content'
              ? `[MCP] No content found in ${htmlPath}`
              : `[MCP] Insufficient content in ${htmlPath}`
          );
          return null;
        }
        return result.doc;
      } catch (error) {
        console.error(`[MCP] Error processing ${htmlPath}:`, error);
        return null;
      }
    },
    { concurrency: 10 }
  );

  return {
    docs: results.filter((doc): doc is ProcessedDoc => doc !== null),
    pageCount: pages.length,
  };
}

/** Extract the document for one page's HTML. */
export async function extractPage(
  html: string,
  route: string,
  options: PageOptions
): Promise<{ doc: ProcessedDoc } | { skipped: SkipReason }> {
  const tree = htmlParser.parse(html);

  const content =
    findContentElement(tree, options.contentSelectors) ?? (select('body', tree) as Element | null);
  if (!content) {
    return { skipped: 'no-content' };
  }

  const markdown = await hastToMarkdown(removeExcluded(content, options.excludeSelectors));
  if (!markdown || markdown.trim().length < options.minContentLength) {
    return { skipped: 'too-short' };
  }

  return {
    doc: {
      route,
      title: extractTitle(tree),
      description: extractDescription(tree),
      markdown,
      headings: extractHeadingsFromMarkdown(markdown),
    },
  };
}

/** The page's h1, else its `<title>`. */
function extractTitle(tree: Root): string {
  const heading = select('h1', tree) ?? select('title', tree);
  return heading ? toString(heading).trim() : 'Untitled';
}

/** The meta description, else the Open Graph description. */
function extractDescription(tree: Root): string {
  for (const selector of ['meta[name="description"]', 'meta[property="og:description"]']) {
    const meta = select(selector, tree) as Element | null;
    if (meta?.properties?.content) {
      return String(meta.properties.content);
    }
  }
  return '';
}

/** The first content selector that matches an element with real text (over 50 characters). */
function findContentElement(tree: Root, selectors: string[]): Element | null {
  for (const selector of selectors) {
    const element = select(selector, tree) as Element | null;
    if (element && toString(element).trim().length > 50) {
      return element;
    }
  }
  return null;
}

/** Never content, whatever the options say. */
const ALWAYS_EXCLUDED = ['script', 'style', 'noscript'];

/**
 * A copy of `element` without its descendants that match an exclude
 * selector. Supports tag names, `.class`, and `[attr="value"]` on plain
 * (non-hyphenated) attributes.
 */
function removeExcluded(element: Element, excludeSelectors: string[]): Element {
  const selectors = [...ALWAYS_EXCLUDED, ...excludeSelectors];
  const cloned = JSON.parse(JSON.stringify(element)) as Element;

  const matches = (node: Element): boolean =>
    selectors.some((selector) => {
      if (selector.startsWith('.')) {
        const className = selector.slice(1);
        const classes = node.properties?.className;
        return (
          (Array.isArray(classes) && classes.includes(className)) ||
          (typeof classes === 'string' && classes.includes(className))
        );
      }
      if (selector.startsWith('[')) {
        const match = selector.match(/\[([^=]+)="([^"]+)"\]/);
        return Boolean(match?.[1] && node.properties?.[match[1]] === match[2]);
      }
      return node.tagName === selector;
    });

  function prune(node: Element): void {
    if (!node.children) return;
    node.children = node.children.filter((child) => {
      if (child.type !== 'element') return true;
      if (matches(child)) return false;
      prune(child);
      return true;
    });
  }

  prune(cloned);
  return cloned;
}
