/**
 * Build-time packaging of Agent Skills into the `skills.json` artifact.
 *
 * Each skill is a `SKILL.md` (YAML frontmatter + markdown) and optional
 * supporting files, per the Agent Skills specification. Packaging works on
 * in-memory {@link SkillSource}s, whatever produced them; reading a skill
 * directory is one way to get a source ({@link readSkillDir}). This module
 * validates sources against the constraints of the MCP skills extension
 * (SEP-2640), precomputes per-file SHA-256 digests and sizes so the runtime
 * can serve `skills/list` without hashing, and decides what happens when two
 * sources share a name ({@link packageSkills}).
 */

import path from 'node:path';
import { createHash } from 'node:crypto';
import fs from 'fs-extra';
import { parse as parseYaml } from 'yaml';
import type { SkillArtifact, SkillFile, SkillsArtifact } from '../types/index.js';
import {
  BUILTIN_SKILL_NAME,
  builtinTemplateVars,
  findBuiltinSkillsDir,
  renderSkillTemplate,
} from './builtin.js';
import { FRONTMATTER_PATTERN, MAX_SKILL_NAME_LENGTH, isValidSkillName } from './frontmatter.js';
import type { SiteMapDoc } from './site-map.js';

const MAX_DESCRIPTION_LENGTH = 1024;

/** Per-skill limits every conforming host must accept (SEP-2640 "Limits") */
export const MAX_SKILL_FILES = 512;
export const MAX_SKILL_BYTES = 16 * 1024 * 1024;

const MIME_TYPES: Record<string, string> = {
  '.md': 'text/markdown',
  '.mdx': 'text/markdown',
  '.txt': 'text/plain',
  '.json': 'application/json',
  '.yaml': 'application/yaml',
  '.yml': 'application/yaml',
  '.html': 'text/html',
  '.csv': 'text/csv',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.ts': 'text/plain',
  '.py': 'text/x-python',
  '.sh': 'text/x-shellscript',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.pdf': 'application/pdf',
};

const utf8 = new TextDecoder('utf-8', { fatal: true });

/**
 * Thrown when a skill directory fails validation at build time.
 *
 * @experimental May change in a 2.x minor release; pin a version if you depend on it.
 */
export class SkillValidationError extends Error {
  constructor(source: string, message: string) {
    super(`[MCP] Invalid skill at ${source}: ${message}`);
    this.name = 'SkillValidationError';
  }
}

/**
 * Parse and validate SKILL.md frontmatter. Returns the frontmatter as a JSON
 * object, which the skills extension requires to be identical in content to
 * what a host parses from the served SKILL.md.
 */
export function parseSkillFrontmatter(
  markdown: string,
  source: string
): SkillArtifact['frontmatter'] {
  const match = FRONTMATTER_PATTERN.exec(markdown);
  if (!match) {
    throw new SkillValidationError(source, 'SKILL.md must begin with YAML frontmatter (---)');
  }

  let parsed: unknown;
  try {
    parsed = parseYaml(match[1] ?? '');
  } catch (error) {
    throw new SkillValidationError(source, `frontmatter is not valid YAML: ${String(error)}`);
  }

  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new SkillValidationError(source, 'frontmatter must be a YAML mapping');
  }

  // Normalize to plain JSON so the artifact matches what hosts compare against.
  const frontmatter = JSON.parse(JSON.stringify(parsed)) as Record<string, unknown>;
  const { name, description } = frontmatter;

  if (typeof name !== 'string' || !isValidSkillName(name)) {
    throw new SkillValidationError(
      source,
      `frontmatter "name" must be 1-${MAX_SKILL_NAME_LENGTH} lowercase letters, digits, and single hyphens`
    );
  }
  if (
    typeof description !== 'string' ||
    description.trim().length === 0 ||
    description.length > MAX_DESCRIPTION_LENGTH
  ) {
    throw new SkillValidationError(
      source,
      `frontmatter "description" must be a non-empty string of at most ${MAX_DESCRIPTION_LENGTH} characters`
    );
  }

  return frontmatter as SkillArtifact['frontmatter'];
}

function mimeTypeFor(filePath: string): string {
  return MIME_TYPES[path.extname(filePath).toLowerCase()] ?? 'application/octet-stream';
}

/** A file read from a skill directory, before packaging */
export interface RawSkillFile {
  /** Path relative to the skill root, `/`-separated */
  path: string;
  bytes: Buffer;
}

/** Extensions of executable scripts. Packaged, but warned about (see warnOnScripts). */
const SCRIPT_EXTENSIONS = new Set([
  '.sh',
  '.bash',
  '.py',
  '.js',
  '.mjs',
  '.cjs',
  '.ts',
  '.rb',
  '.ps1',
]);

function isBinaryMime(mimeType: string): boolean {
  return (
    (mimeType.startsWith('image/') && mimeType !== 'image/svg+xml') ||
    mimeType === 'application/pdf'
  );
}

function toSkillFile(filePath: string, bytes: Buffer): SkillFile {
  const mimeType = mimeTypeFor(filePath);
  const digest = `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
  const base = { path: filePath, mimeType, digest, size: bytes.length };

  if (!isBinaryMime(mimeType) && !bytes.includes(0)) {
    try {
      // Only store as text when it round-trips byte-for-byte, so the digest
      // and size hold for what resources/read serves.
      const text = utf8.decode(bytes);
      if (Buffer.byteLength(text, 'utf8') === bytes.length) {
        return { ...base, text };
      }
    } catch {
      // Not valid UTF-8; fall through to base64.
    }
  }

  return { ...base, blob: bytes.toString('base64') };
}

/**
 * One skill to package, before validation, from wherever it came from: the
 * package's built-in skills, an author's skills directory, or (later) pages.
 */
export interface SkillSource {
  /** The name the skill must have; its SKILL.md frontmatter `name` has to match */
  name: string;
  /** Where it came from, for error messages, e.g. the skill's directory */
  origin: string;
  /**
   * Decides name collisions: an author skill replaces a built-in one of the
   * same name. `guide` is a skill compiled from an agent guide in the pages.
   */
  kind: 'builtin' | 'author' | 'guide';
  /** Every file, with `SKILL.md` among them, paths relative to the skill root */
  files: RawSkillFile[];
}

/**
 * Package one skill: validate it, then compute digests and sizes. Throws
 * {@link SkillValidationError}, naming `source.origin`, if it is invalid.
 */
export function packageSkill(source: SkillSource): SkillArtifact {
  const { origin, files } = source;
  const skillMd = files.find((f) => f.path === 'SKILL.md');
  if (!skillMd) {
    throw new SkillValidationError(origin, 'missing SKILL.md at the skill root');
  }

  const frontmatter = parseSkillFrontmatter(skillMd.bytes.toString('utf8'), origin);
  if (frontmatter.name !== source.name) {
    throw new SkillValidationError(
      origin,
      `frontmatter name "${frontmatter.name}" must match the directory name "${source.name}"`
    );
  }

  if (files.length > MAX_SKILL_FILES) {
    throw new SkillValidationError(
      origin,
      `${files.length} files exceeds the ${MAX_SKILL_FILES}-file limit`
    );
  }
  const totalBytes = files.reduce((sum, f) => sum + f.bytes.length, 0);
  if (totalBytes > MAX_SKILL_BYTES) {
    throw new SkillValidationError(
      origin,
      `${totalBytes} bytes exceeds the ${MAX_SKILL_BYTES}-byte limit`
    );
  }

  const rest = files.filter((f) => f !== skillMd).sort((a, b) => compareNames(a.path, b.path));
  warnOnScripts(frontmatter.name, rest);

  return {
    skillPath: frontmatter.name,
    frontmatter,
    files: [skillMd, ...rest].map((f) => toSkillFile(f.path, f.bytes)),
  };
}

/**
 * Hosts treat MCP-served skills as untrusted and won't run bundled scripts
 * without explicit per-skill approval (SEP-2640), so scripts rarely help.
 */
function warnOnScripts(skillName: string, files: RawSkillFile[]): void {
  const scripts = files
    .map((f) => f.path)
    .filter((p) => SCRIPT_EXTENSIONS.has(path.extname(p).toLowerCase()));
  if (scripts.length > 0) {
    console.warn(
      `[MCP] Skill "${skillName}" includes scripts (${scripts.join(', ')}). ` +
        'MCP hosts will not run them without explicit user approval; prefer markdown instructions.'
    );
  }
}

function compareNames(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

async function readSkillFiles(root: string, relDir = ''): Promise<RawSkillFile[]> {
  const entries = await fs.readdir(path.join(root, relDir), { withFileTypes: true });
  const files: RawSkillFile[] = [];

  for (const entry of entries) {
    // Skip dotfiles (.DS_Store, .git, editor state).
    if (entry.name.startsWith('.')) continue;

    const rel = relDir ? `${relDir}/${entry.name}` : entry.name;
    // withFileTypes reports symlinks as symlinks (no follow), so cycles can't recurse.
    if (entry.isSymbolicLink()) {
      console.warn(`[MCP] Skipping symlink in skill: ${path.join(root, rel)}`);
    } else if (entry.isDirectory()) {
      files.push(...(await readSkillFiles(root, rel)));
    } else if (entry.isFile()) {
      files.push({ path: rel, bytes: await fs.readFile(path.join(root, rel)) });
    }
  }

  return files;
}

/**
 * A skill directory as a source. The directory name is the name the skill
 * must have, and the directory is its origin in error messages.
 */
export async function readSkillDir(
  skillDir: string,
  kind: SkillSource['kind']
): Promise<SkillSource> {
  return {
    name: path.basename(skillDir),
    origin: skillDir,
    kind,
    files: await readSkillFiles(skillDir),
  };
}

/**
 * Every `<dir>/<name>/SKILL.md` skill directory as a source, in name order.
 */
export async function readSkillsDir(
  dir: string,
  kind: SkillSource['kind']
): Promise<SkillSource[]> {
  if (!(await fs.pathExists(dir))) {
    throw new Error(`[MCP] Skills directory not found: ${dir}`);
  }

  const entries = await fs.readdir(dir, { withFileTypes: true });
  const sources: SkillSource[] = [];

  for (const entry of entries.sort((a, b) => compareNames(a.name, b.name))) {
    if (entry.name.startsWith('.')) continue;
    const skillDir = path.join(dir, entry.name);
    // Follow a symlinked skill directory at the top level (common for shared
    // skills); symlinks inside a skill are skipped by readSkillFiles.
    if (!(await fs.stat(skillDir)).isDirectory()) continue;

    sources.push(await readSkillDir(skillDir, kind));
  }

  return sources;
}

/** A source with its SKILL.md rewritten, e.g. a built-in template filled in. */
export function withSkillMd(
  source: SkillSource,
  render: (markdown: string) => string
): SkillSource {
  return {
    ...source,
    files: source.files.map((f) =>
      f.path === 'SKILL.md'
        ? { ...f, bytes: Buffer.from(render(f.bytes.toString('utf8')), 'utf8') }
        : f
    ),
  };
}

/**
 * Package every source into the `skills.json` artifact, deciding name
 * collisions in one place: an author skill replaces a built-in skill of the
 * same name (keeping its position); any other repeated name, including a
 * guide sharing a name with any skill, is an error.
 */
export function packageSkills(sources: SkillSource[]): SkillsArtifact {
  const byName = new Map<
    string,
    { kind: SkillSource['kind']; origin: string; skill: SkillArtifact }
  >();

  for (const source of sources) {
    const skill = packageSkill(source);
    const name = skill.frontmatter.name;
    const existing = byName.get(name);
    if (existing) {
      if (existing.kind !== 'builtin' || source.kind !== 'author') {
        throw new SkillValidationError(
          source.origin,
          `skill name "${name}" is already used by ${existing.origin}`
        );
      }
      console.log(`[MCP] Skill "${name}" overrides the built-in skill`);
    }
    byName.set(name, { kind: source.kind, origin: source.origin, skill });
  }

  return { version: 1, skills: [...byName.values()].map((entry) => entry.skill) };
}

/**
 * Options for {@link buildSkillsArtifact}.
 *
 * @experimental May change in a 2.x minor release; pin a version if you depend on it.
 */
export interface BuildSkillsOptions {
  /** Include the built-in docs-research skill */
  builtin: boolean;
  /** Absolute path to a directory of skill directories */
  dir?: string;
  /** Site title used in the built-in skill */
  siteTitle: string;
  /**
   * Absolute site URL including the base path (e.g. `https://example.com/docs/`).
   * The built-in skill names its host, and links pages from its site map.
   */
  siteUrl?: string;
  /** Site tagline, added to the built-in skill's description */
  siteTagline?: string;
  /**
   * Indexed pages. With `siteUrl`, the built-in skill gets a generated
   * "Where things are" section grouping them by URL path.
   */
  docs?: SiteMapDoc[];
}

/**
 * Build the `skills.json` artifact. Author skills override the built-in skill
 * when they share its name. The plugin calls this in `postBuild`; call it
 * directly only to build skills outside Docusaurus.
 *
 * @experimental May change in a 2.x minor release; pin a version if you depend on it.
 */
export async function buildSkillsArtifact(options: BuildSkillsOptions): Promise<SkillsArtifact> {
  return packageSkills(await readSkillSources(options));
}

/**
 * The built-in and author skills as sources, not yet packaged, so the build
 * can package them together with skills from other sources (agent guides).
 */
export async function readSkillSources(options: BuildSkillsOptions): Promise<SkillSource[]> {
  const sources: SkillSource[] = [];

  if (options.builtin) {
    const builtinDir = path.join(await findBuiltinSkillsDir(), BUILTIN_SKILL_NAME);
    const vars = builtinTemplateVars({
      title: options.siteTitle,
      url: options.siteUrl,
      tagline: options.siteTagline,
      docs: options.docs,
    });
    // The template is filled before validation and hashing, so the built-in
    // skill goes through exactly the same checks as author skills.
    const source = await readSkillDir(builtinDir, 'builtin');
    sources.push(withSkillMd(source, (md) => renderSkillTemplate(md, vars)));
  }

  if (options.dir) {
    sources.push(...(await readSkillsDir(options.dir, 'author')));
  }

  return sources;
}
