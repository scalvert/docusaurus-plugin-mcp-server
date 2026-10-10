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
import { select, selectAll } from 'hast-util-select';
import { toString } from 'hast-util-to-string';
import type { Element, ElementContent, Root } from 'hast';
import type { ProcessedDoc } from '../types/index.js';
import { discoverPages } from './pages.js';
import { hastToMarkdown } from './markdown.js';
import { extractHeadings, htmlHeadings } from './headings.js';
import { toAgentView } from '../agent-view/tree.js';
import { extractGuides, type PageGuides } from '../guides/extract.js';
import { documentId } from '../artifacts/bundle.js';

export interface PageOptions {
  /** CSS selectors for the content container, in priority order */
  contentSelectors: string[];
  /** CSS selectors for elements to drop from the content */
  excludeSelectors: string[];
  /** Pages with less Markdown than this (in characters) are skipped */
  minContentLength: number;
  /**
   * The site's URL with its base path (`https://docs.example.com/docs/`).
   * Links in agent guides resolve against each page's URL under it.
   */
  baseUrl?: string;
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
  /** Agent guide markup, for each kept page that has any */
  guides: PageGuides[];
}

const htmlParser = unified().use(rehypeParse);

/** For checking that a selector parses (pseudo-class errors only show on matching pages). */
const EMPTY_ROOT: Root = { type: 'root', children: [] };

/**
 * Extract a document from every page in a build directory. Pages that fail
 * or are skipped are logged and left out; they never fail the build.
 * Progress is logged with the `[MCP]` prefix.
 */
export async function extractDocs(
  outDir: string,
  options: ExtractDocsOptions
): Promise<ExtractDocsResult> {
  const onInvalidSelector = warnOnce();
  const pages = await discoverPages(outDir, options.excludeRoutes);
  console.log(`[MCP] Found ${pages.length} routes to process`);
  if (pages.length === 0) {
    console.warn('[MCP] No routes found to process');
    return { docs: [], pageCount: 0, guides: [] };
  }

  const results = await pMap(
    pages,
    async ({ route, htmlPath }) => {
      try {
        const html = await fs.readFile(htmlPath, 'utf-8');
        const result = await extractPage(html, route, options, onInvalidSelector);
        if ('skipped' in result) {
          console.warn(
            result.skipped === 'no-content'
              ? `[MCP] No content found in ${htmlPath}`
              : `[MCP] Insufficient content in ${htmlPath}`
          );
          return null;
        }
        return result;
      } catch (error) {
        console.error(`[MCP] Error processing ${htmlPath}:`, error);
        return null;
      }
    },
    { concurrency: 10 }
  );

  const kept = results.filter((result) => result !== null);
  return {
    docs: kept.map((result) => result.doc),
    pageCount: pages.length,
    guides: kept.flatMap((result) => (result.guides ? [result.guides] : [])),
  };
}

/**
 * Called for a selector that can't be used (it doesn't parse, or uses an
 * unsupported pseudo-class). That selector matches nothing.
 */
export type InvalidSelectorHandler = (
  option: 'contentSelectors' | 'excludeSelectors',
  selector: string,
  error: unknown
) => void;

/** A handler that warns about each invalid selector once. */
export function warnOnce(): InvalidSelectorHandler {
  const reported = new Set<string>();
  return (option, selector, error) => {
    const key = `${option}\0${selector}`;
    if (reported.has(key)) return;
    reported.add(key);
    console.warn(
      `[MCP] Ignoring ${option} entry ${JSON.stringify(selector)}: ` +
        (error instanceof Error ? error.message : String(error))
    );
  };
}

/**
 * Extract the document for one page's HTML. Invalid selectors are reported
 * to `onInvalidSelector` (by default, a warning per call) and skipped.
 */
export async function extractPage(
  html: string,
  route: string,
  options: PageOptions,
  onInvalidSelector: InvalidSelectorHandler = warnOnce()
): Promise<{ doc: ProcessedDoc; guides?: PageGuides } | { skipped: SkipReason }> {
  const tree = htmlParser.parse(html);
  // A selector's errors can depend on the page (hast-util-select only
  // evaluates a pseudo-class once the rest of the compound matches), so
  // catch them where selectors run.
  const safeSelectAll = (
    option: 'contentSelectors' | 'excludeSelectors',
    selector: string
  ): Element[] => {
    try {
      return selectAll(selector, tree);
    } catch (error) {
      onInvalidSelector(option, selector, error);
      return [];
    }
  };

  const content =
    findContentElement(options.contentSelectors, (selector) =>
      safeSelectAll('contentSelectors', selector)
    ) ?? (select('body', tree) as Element | null);
  if (!content) {
    return { skipped: 'no-content' };
  }

  // One pass over the page for the whole list; one per selector only if the
  // list fails, to find (and skip) the selector at fault. Only selectors that
  // parse on their own are joined, so two broken ones (`[title="a`, `b"]`)
  // can't join into a valid one.
  const parseable = options.excludeSelectors.filter((selector) => {
    try {
      selectAll(selector, EMPTY_ROOT);
      return true;
    } catch (error) {
      onInvalidSelector('excludeSelectors', selector, error);
      return false;
    }
  });
  let excluded: Element[];
  try {
    excluded = selectAll([...ALWAYS_EXCLUDED, ...parseable].join(', '), tree);
  } catch {
    excluded = [
      ...ALWAYS_EXCLUDED.flatMap((selector) => selectAll(selector, tree)),
      ...parseable.flatMap((selector) => safeSelectAll('excludeSelectors', selector)),
    ];
  }
  // Everything below reads the agent view: Markdown, headings, and so search.
  const cleaned = toAgentView(removeExcluded(content, excluded));
  const markdown = await hastToMarkdown(cleaned);
  if (!markdown || markdown.trim().length < options.minContentLength) {
    return { skipped: 'too-short' };
  }

  const title = extractTitle(tree);
  const guides = await extractGuides({
    route,
    pageTitle: title,
    tree,
    content,
    view: cleaned,
    url: options.baseUrl ? documentId({ route }, options.baseUrl) : undefined,
  });
  return {
    doc: {
      route,
      title,
      description: extractDescription(tree),
      markdown,
      headings: extractHeadings(markdown, htmlHeadings(cleaned)),
    },
    ...(guides ? { guides } : {}),
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

/**
 * The first element matched by the first content selector, if it has real
 * text (over 50 characters); else the next selector's.
 */
function findContentElement(
  selectors: string[],
  selectAllOf: (selector: string) => Element[]
): Element | null {
  for (const selector of selectors) {
    const element = selectAllOf(selector)[0];
    if (element && toString(element).trim().length > 50) {
      return element;
    }
  }
  return null;
}

/** Never content, whatever the options say. */
const ALWAYS_EXCLUDED = [
  'script',
  'style',
  'noscript',
  // Docusaurus's heading permalink: a zero-width "Direct link to …" anchor.
  'a.hash-link',
];

/**
 * A copy of the page's content element without the `excluded` elements and
 * their subtrees. Exclude selectors are full CSS, matched against the whole
 * page, so `main .x` or `[data-x="y"]` work. The content element itself is
 * never removed.
 */
function removeExcluded(content: Element, excludedElements: Element[]): Element {
  const excluded = new Set<ElementContent>(excludedElements);
  excluded.delete(content);

  const copy = (node: Element): Element => ({
    ...node,
    properties: { ...node.properties },
    children: node.children
      .filter((child) => !excluded.has(child))
      .map((child) => (child.type === 'element' ? copy(child) : { ...child })),
  });
  return copy(content);
}
