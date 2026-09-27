/**
 * The built-in skills shipped with the package, under `skills-builtin/` at
 * the package root (published via package.json `files`).
 *
 * Built-in skills are ordinary skill directories. The only difference from
 * author skills is that their SKILL.md may use `{{siteTitle}}`, filled in at
 * build time. To customize one, copy its directory into your own skills dir
 * (a skill with the same name replaces the built-in) and edit it there.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'fs-extra';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import { FRONTMATTER_PATTERN } from './frontmatter.js';

/** Name (and directory) of the built-in docs research skill */
export const BUILTIN_SKILL_NAME = 'docs-research';

const BUILTIN_DIR_NAME = 'skills-builtin';
const SITE_TITLE_PLACEHOLDER = '{{siteTitle}}';

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

function replacePlaceholder<T>(value: T, site: string): T {
  if (typeof value === 'string') {
    return value.replaceAll(SITE_TITLE_PLACEHOLDER, site) as T;
  }
  if (Array.isArray(value)) {
    return value.map((v) => replacePlaceholder(v, site)) as T;
  }
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, replacePlaceholder(v, site)])
    ) as T;
  }
  return value;
}

/**
 * Fill `{{siteTitle}}` into a built-in SKILL.md. Frontmatter is parsed and
 * re-serialized rather than string-replaced, so titles containing YAML
 * syntax (`:`, quotes, `#`) can't corrupt it. Markdown without frontmatter
 * is returned unchanged; packaging then rejects it like any invalid skill.
 */
export function renderSkillTemplate(markdown: string, siteTitle: string): string {
  const match = FRONTMATTER_PATTERN.exec(markdown);
  if (!match) return markdown;

  const site = siteTitle.trim() || 'this site';
  const frontmatter = replacePlaceholder(parseYaml(match[1] ?? ''), site);
  const yaml = stringifyYaml(frontmatter, { lineWidth: 0 }).trimEnd();
  const body = markdown.slice(match[0].length).replaceAll(SITE_TITLE_PLACEHOLDER, site);

  return `---\n${yaml}\n---\n${body}`;
}
