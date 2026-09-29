/**
 * The built-in skills shipped with the package, under `skills-builtin/` at
 * the package root (published via package.json `files`).
 *
 * Built-in skills are ordinary skill directories. The only difference from
 * author skills is that their SKILL.md may use the placeholders in
 * {@link SkillTemplateVars}, filled in at build time. To customize one, copy
 * its directory into your own skills dir (a skill with the same name replaces
 * the built-in) and edit it there.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'fs-extra';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import { FRONTMATTER_PATTERN } from './frontmatter.js';
import { renderSiteMap, type SiteMapDoc } from './site-map.js';

/** Name (and directory) of the built-in docs research skill */
export const BUILTIN_SKILL_NAME = 'docs-research';

const BUILTIN_DIR_NAME = 'skills-builtin';

/** The Docusaurus classic template's tagline, which says nothing about a site */
const TEMPLATE_TAGLINE = 'dinosaurs are cool';

/**
 * Values for the `{{name}}` placeholders in a built-in SKILL.md.
 *
 * - `siteTitle`: the site title, e.g. `Glean Developer`
 * - `siteDocs`: a phrase naming the docs, e.g. `the Glean Developer documentation`
 * - `siteSummary`: `siteDocs` plus the site's host and tagline, for the
 *   description agents use to decide when to load the skill
 * - `siteMap`: a generated "Where things are" section, or empty
 */
export interface SkillTemplateVars {
  siteTitle: string;
  siteDocs: string;
  siteSummary: string;
  siteMap: string;
}

/** What the plugin knows about the site when rendering built-in skills */
export interface BuiltinSkillSite {
  /** Docusaurus `title` */
  title: string;
  /** Absolute site URL including the base path, e.g. `https://example.com/docs/` */
  url?: string;
  /** Docusaurus `tagline` */
  tagline?: string;
  /** Indexed pages, for the generated site map */
  docs?: SiteMapDoc[];
}

/** `https://example.com/docs/` -> `example.com/docs` */
function displayHost(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.host}${parsed.pathname}`.replace(/\/+$/, '');
  } catch {
    return '';
  }
}

function usefulTagline(tagline: string | undefined, title: string): string {
  const cleaned = (tagline ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[.!]+$/, '');
  const lower = cleaned.toLowerCase();
  if (!cleaned || lower === title.toLowerCase() || lower === TEMPLATE_TAGLINE) return '';
  return cleaned;
}

/** Placeholder values for the built-in skills, derived from the site */
export function builtinTemplateVars(site: BuiltinSkillSite): SkillTemplateVars {
  const title = site.title.replace(/\s+/g, ' ').trim();
  // "Acme Docs" -> "the Acme Docs", not "the Acme Docs documentation"
  const namesDocs = /\b(docs|documentation)$/i.test(title);
  const siteDocs = !title
    ? "this site's documentation"
    : namesDocs
      ? `the ${title}`
      : `the ${title} documentation`;
  const host = site.url ? displayHost(site.url) : '';
  const tagline = usefulTagline(site.tagline, title);
  return {
    siteTitle: title || 'this site',
    siteDocs,
    siteSummary: `${siteDocs}${host ? ` at ${host}` : ''}${tagline ? ` (${tagline})` : ''}`,
    siteMap: site.docs && site.url ? renderSiteMap(site.docs, site.url) : '',
  };
}

/**
 * Locate `skills-builtin/` by walking up from this module. The module is
 * bundled into `dist/*.js` for the published package but runs from
 * `src/skills/` in tests, so a fixed relative path would only work for one.
 */
export async function findBuiltinSkillsDir(
  from: string = path.dirname(fileURLToPath(import.meta.url))
): Promise<string> {
  let dir = from;
  for (;;) {
    const candidate = path.join(dir, BUILTIN_DIR_NAME);
    if (await fs.pathExists(candidate)) return candidate;

    const parent = path.dirname(dir);
    if (parent === dir) {
      throw new Error(`[MCP] Built-in skills directory "${BUILTIN_DIR_NAME}" not found`);
    }
    dir = parent;
  }
}

const PLACEHOLDER_PATTERN = /\{\{(siteTitle|siteDocs|siteSummary|siteMap)\}\}/g;

function fill(text: string, vars: SkillTemplateVars): string {
  return text.replace(PLACEHOLDER_PATTERN, (_, name: keyof SkillTemplateVars) => vars[name]);
}

function fillValue<T>(value: T, vars: SkillTemplateVars): T {
  if (typeof value === 'string') {
    return fill(value, vars) as T;
  }
  if (Array.isArray(value)) {
    return value.map((v) => fillValue(v, vars)) as T;
  }
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, fillValue(v, vars)])) as T;
  }
  return value;
}

/**
 * Fill the {@link SkillTemplateVars} placeholders into a built-in SKILL.md.
 * Frontmatter is parsed and re-serialized rather than string-replaced, so
 * values containing YAML syntax (`:`, quotes, `#`) can't corrupt it. An empty
 * placeholder on a line of its own (such as `{{siteMap}}` with no map) leaves
 * no extra blank lines. Markdown without frontmatter is returned unchanged;
 * packaging then rejects it like any invalid skill.
 */
export function renderSkillTemplate(markdown: string, vars: SkillTemplateVars): string {
  const match = FRONTMATTER_PATTERN.exec(markdown);
  if (!match) return markdown;

  const frontmatter = fillValue(parseYaml(match[1] ?? ''), vars);
  const yaml = stringifyYaml(frontmatter, { lineWidth: 0 }).trimEnd();
  const body = fill(markdown.slice(match[0].length), vars).replace(/\n{3,}/g, '\n\n');

  return `---\n${yaml}\n---\n${body}`;
}
