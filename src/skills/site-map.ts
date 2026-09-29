/**
 * The "Where things are" section of the built-in docs-research skill: the
 * site's pages grouped by URL path, generated at build time so it matches
 * what was indexed.
 */

import { documentId } from '../search/local-search.js';
import type { ProcessedDoc } from '../types/index.js';

/** The fields of a page the site map uses */
export type SiteMapDoc = Pick<ProcessedDoc, 'route' | 'title'>;

/** Most sections to list; the rest are summarized in one line */
const MAX_SECTIONS = 12;
/** Example page titles per section */
const MAX_EXAMPLES = 3;
const MAX_TITLE_LENGTH = 80;

interface Page {
  segments: string[];
  route: string;
  title: string;
}

interface Section {
  /** Route prefix shared by the section's pages, e.g. `/guides` */
  path: string;
  pages: Page[];
  /** The page at the section path itself, if there is one */
  overview?: Page;
}

function cleanTitle(title: string): string {
  const oneLine = title.replace(/\s+/g, ' ').trim();
  return oneLine.length > MAX_TITLE_LENGTH
    ? `${oneLine.slice(0, MAX_TITLE_LENGTH - 1).trimEnd()}…`
    : oneLine;
}

function toPages(docs: SiteMapDoc[]): Page[] {
  const pages: Page[] = [];
  for (const doc of docs) {
    const title = cleanTitle(doc.title);
    if (!title) continue;
    pages.push({ segments: doc.route.split('/').filter(Boolean), route: doc.route, title });
  }
  return pages;
}

/**
 * Group pages by the first path segment where they differ. Sites whose pages
 * all live under one prefix (for example `/docs/...`) are grouped one level
 * further down, so they don't collapse into a single section.
 */
function groupSections(pages: Page[]): Section[] {
  let depth = 0;
  let prefix: string[] = [];
  for (;;) {
    const below = pages.filter(
      (p) => p.segments.length > depth && prefix.every((s, i) => p.segments[i] === s)
    );
    const heads = new Set(below.map((p) => p.segments[depth]));
    const onlyHead = heads.size === 1 ? [...heads][0] : undefined;
    const deeper = below.some((p) => p.segments.length > depth + 1);
    if (onlyHead === undefined || !deeper) break;
    prefix = [...prefix, onlyHead];
    depth += 1;
  }

  const byHead = new Map<string, Section>();
  for (const page of pages) {
    if (page.segments.length <= depth || !prefix.every((s, i) => page.segments[i] === s)) {
      continue;
    }
    const head = page.segments[depth] as string;
    const path = `/${[...prefix, head].join('/')}`;
    const section = byHead.get(head) ?? { path, pages: [] };
    section.pages.push(page);
    if (page.segments.length === depth + 1) section.overview = page;
    byHead.set(head, section);
  }
  return [...byHead.values()];
}

/** Shallowest pages first (usually overviews), then by route, without repeats */
function examples(section: Section): string[] {
  const seen = new Set<string>();
  if (section.overview) seen.add(section.overview.title.toLowerCase());
  const titles: string[] = [];
  const candidates = section.pages
    .filter((p) => p !== section.overview)
    .sort((a, b) => a.segments.length - b.segments.length || a.route.localeCompare(b.route));
  for (const page of candidates) {
    const key = page.title.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    titles.push(page.title);
    if (titles.length === MAX_EXAMPLES) break;
  }
  return titles;
}

function renderSection(section: Section, siteUrl: string): string {
  const count = section.pages.length;
  const pages = count === 1 ? '1 page' : `${count} pages`;
  const parts = [`- \`${section.path}\` (${pages})`];
  if (section.overview) {
    parts.push(`: [${section.overview.title}](${documentId(section.overview, siteUrl)})`);
  }
  const titles = examples(section);
  if (titles.length > 0) {
    parts.push(`${section.overview ? '.' : ':'} Includes ${titles.join('; ')}.`);
  }
  return parts.join('');
}

/**
 * Render the "Where things are" section for the given pages, or an empty
 * string when grouping wouldn't help: unless at least two sections have more
 * than one page, the "sections" are just a list of pages.
 *
 * @param siteUrl Absolute site URL including the base path, used to link each
 * section's overview page with the same URL `docs_fetch` expects.
 */
export function renderSiteMap(docs: SiteMapDoc[], siteUrl: string): string {
  const pages = toPages(docs);
  const sections = groupSections(pages).sort(
    (a, b) => b.pages.length - a.pages.length || a.path.localeCompare(b.path)
  );
  if (sections.filter((s) => s.pages.length > 1).length < 2) return '';

  const shown = sections.slice(0, MAX_SECTIONS);
  const rest = sections.slice(MAX_SECTIONS);
  const lines = shown.map((s) => renderSection(s, siteUrl));
  if (rest.length > 0) {
    const restPages = rest.reduce((n, s) => n + s.pages.length, 0);
    lines.push(
      `- …and ${restPages === 1 ? '1 page' : `${restPages} pages`} in ${rest.length} smaller ${rest.length === 1 ? 'section' : 'sections'}.`
    );
  }

  return [
    '## Where things are',
    '',
    `The ${pages.length === 1 ? '1 indexed page' : `${pages.length} indexed pages`}, grouped by URL path, largest sections first. Use a section's terms in searches to narrow results, or fetch its linked overview page to see what it covers.`,
    '',
    ...lines,
  ].join('\n');
}
