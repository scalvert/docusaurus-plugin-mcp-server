/**
 * The "Where things are" section of the built-in docs-research skill: the
 * site's pages grouped by URL path, generated at build time so it matches
 * what was indexed.
 */

import { documentId } from '../artifacts/bundle.js';
import type { ProcessedDoc } from '../types/index.js';

/**
 * The fields of a page the site map uses.
 *
 * @experimental May change in a 2.x minor release; pin a version if you depend on it.
 */
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
  /** Path segments shared by the section's pages, e.g. `['api', 'client']` */
  prefix: string[];
  pages: Page[];
  /** The page at the section path itself, if there is one */
  overview?: Page;
}

/**
 * Locale-independent ordering. `localeCompare` depends on the build machine's
 * ICU data and locale, and this text is hashed into the skill's digest.
 */
const compareStrings = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

const pagesLabel = (n: number) => (n === 1 ? '1 page' : `${n} pages`);

/** Collapse whitespace and cap the length of a page title */
function cleanTitle(title: string): string {
  const oneLine = title.replace(/\s+/g, ' ').trim();
  return oneLine.length > MAX_TITLE_LENGTH
    ? `${oneLine.slice(0, MAX_TITLE_LENGTH - 1).trimEnd()}…`
    : oneLine;
}

/** Escape the characters that would end link text or start HTML in markdown */
const escapeText = (text: string) => text.replace(/[\\[\]<>]/g, '\\$&');

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
 * Group the pages below `prefix` by their next path segment. Pages at the
 * prefix itself belong to no child section.
 */
function groupBelow(pages: Page[], prefix: string[]): Section[] {
  const depth = prefix.length;
  const byHead = new Map<string, Section>();
  for (const page of pages) {
    const head = page.segments[depth];
    if (head === undefined) continue;
    const section = byHead.get(head) ?? { prefix: [...prefix, head], pages: [] };
    section.pages.push(page);
    if (page.segments.length === depth + 1) section.overview = page;
    byHead.set(head, section);
  }
  return [...byHead.values()];
}

/**
 * Group pages by top-level path, then split any section holding more than
 * half of the grouped pages into its subsections, as long as at least one
 * subsection has several pages (otherwise the split just lists pages). A
 * typical site with `/docs/...` next to a small `/blog/...` is grouped by the
 * sections under `/docs`, rather than listing the docs as one section.
 */
function groupSections(pages: Page[]): Section[] {
  let sections = groupBelow(pages, []);
  for (;;) {
    const total = sections.reduce((n, s) => n + s.pages.length, 0);
    const largest = sections.reduce<Section | undefined>(
      (max, s) => (!max || s.pages.length > max.pages.length ? s : max),
      undefined
    );
    if (!largest || largest.pages.length * 2 <= total) return sections;

    const children = groupBelow(largest.pages, largest.prefix);
    if (!children.some((c) => c.pages.length > 1)) return sections;
    sections = sections.filter((s) => s !== largest).concat(children);
  }
}

/**
 * Example titles: one per subsection before any subsection repeats, so they
 * show the section's range. Within that, shallowest pages first (usually
 * overviews), then by route. Titles aren't repeated.
 */
function examples(section: Section): string[] {
  const depth = section.prefix.length;
  const candidates = section.pages
    .filter((p) => p !== section.overview)
    .sort((a, b) => a.segments.length - b.segments.length || compareStrings(a.route, b.route));

  const seen = new Set<string>();
  if (section.overview) seen.add(section.overview.title.toLowerCase());
  const usedHeads = new Set<string>();
  const titles: string[] = [];
  for (const onePerSubsection of [true, false]) {
    for (const page of candidates) {
      if (titles.length === MAX_EXAMPLES) return titles;
      const key = page.title.toLowerCase();
      const head = page.segments[depth] ?? '';
      if (seen.has(key) || (onePerSubsection && usedHeads.has(head))) continue;
      seen.add(key);
      usedHeads.add(head);
      titles.push(page.title);
    }
  }
  return titles;
}

function renderSection(section: Section, siteUrl: string): string {
  const path = `/${section.prefix.join('/')}`.replaceAll('`', '');
  const count = section.pages.length;
  let line = count === 1 ? `- \`${path}\`` : `- \`${path}\` (${pagesLabel(count)})`;
  if (section.overview) {
    const url = documentId(section.overview, siteUrl);
    line += `: [${escapeText(section.overview.title)}](<${url}>)`;
  }
  const titles = examples(section);
  if (titles.length > 0) {
    line += `${section.overview ? '.' : ':'} Includes ${titles.map(escapeText).join('; ')}.`;
  }
  return line;
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
  const sections = groupSections(toPages(docs)).sort(
    (a, b) =>
      b.pages.length - a.pages.length || compareStrings(a.prefix.join('/'), b.prefix.join('/'))
  );
  if (sections.filter((s) => s.pages.length > 1).length < 2) return '';

  const shown = sections.slice(0, MAX_SECTIONS);
  const rest = sections.slice(MAX_SECTIONS);
  const lines = shown.map((s) => renderSection(s, siteUrl));
  if (rest.length > 0) {
    const restPages = rest.reduce((n, s) => n + s.pages.length, 0);
    const restSections =
      rest.length === 1 ? '1 smaller section' : `${rest.length} smaller sections`;
    lines.push(`- …and ${pagesLabel(restPages)} in ${restSections}.`);
  }

  return [
    '## Where things are',
    '',
    "The site's pages, grouped by URL path, largest sections first. Use a section's terms in searches to narrow results, or fetch its linked overview page to see what it covers.",
    '',
    ...lines,
  ].join('\n');
}
