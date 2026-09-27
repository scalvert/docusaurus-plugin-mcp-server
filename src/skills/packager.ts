/**
 * Build-time packaging of Agent Skills into the `skills.json` artifact.
 *
 * Each skill is a directory with a `SKILL.md` (YAML frontmatter + markdown)
 * and optional supporting files, per the Agent Skills specification. This
 * module reads skill directories, validates them against the constraints of
 * the MCP skills extension (SEP-2640), and precomputes per-file SHA-256
 * digests and sizes so the runtime can serve `skills/list` without hashing.
 */

import path from 'node:path';
import { createHash } from 'node:crypto';
import fs from 'fs-extra';
import { parse as parseYaml } from 'yaml';
import type { SkillArtifact, SkillFile, SkillsArtifact } from '../types/index.js';
import { BUILTIN_SKILL_NAME, findBuiltinSkillsDir, renderSkillTemplate } from './builtin.js';
import { FRONTMATTER_PATTERN } from './frontmatter.js';

/** Agent Skills naming rule: lowercase alphanumerics separated by single hyphens */
const SKILL_NAME_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const MAX_NAME_LENGTH = 64;
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

  if (typeof name !== 'string' || !SKILL_NAME_PATTERN.test(name) || name.length > MAX_NAME_LENGTH) {
    throw new SkillValidationError(
      source,
      `frontmatter "name" must be 1-${MAX_NAME_LENGTH} lowercase letters, digits, and single hyphens`
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
 * Package one skill from its files. `skillDir` is the skill's directory; its
 * basename must equal the frontmatter name, and it is used in error messages.
 * `files` must include `SKILL.md`.
 */
export function packageSkill(skillDir: string, files: RawSkillFile[]): SkillArtifact {
  const dirName = path.basename(skillDir);
  const skillMd = files.find((f) => f.path === 'SKILL.md');
  if (!skillMd) {
    throw new SkillValidationError(skillDir, 'missing SKILL.md at the skill root');
  }

  const frontmatter = parseSkillFrontmatter(skillMd.bytes.toString('utf8'), skillDir);
  if (frontmatter.name !== dirName) {
    throw new SkillValidationError(
      skillDir,
      `frontmatter name "${frontmatter.name}" must match the directory name "${dirName}"`
    );
  }

  if (files.length > MAX_SKILL_FILES) {
    throw new SkillValidationError(
      skillDir,
      `${files.length} files exceeds the ${MAX_SKILL_FILES}-file limit`
    );
  }
  const totalBytes = files.reduce((sum, f) => sum + f.bytes.length, 0);
  if (totalBytes > MAX_SKILL_BYTES) {
    throw new SkillValidationError(
      skillDir,
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
 * Package one skill directory. Built-in skills pass `renderSkillMd` to fill
 * their `{{siteTitle}}` template before validation and hashing, so they go
 * through exactly the same path as author skills.
 */
export async function loadSkillDir(
  skillDir: string,
  renderSkillMd?: (markdown: string) => string
): Promise<SkillArtifact> {
  let files = await readSkillFiles(skillDir);
  if (renderSkillMd) {
    files = files.map((f) =>
      f.path === 'SKILL.md'
        ? { ...f, bytes: Buffer.from(renderSkillMd(f.bytes.toString('utf8')), 'utf8') }
        : f
    );
  }
  return packageSkill(skillDir, files);
}

/**
 * Package every `<dir>/<name>/SKILL.md` skill directory.
 */
export async function loadSkillsDir(dir: string): Promise<SkillArtifact[]> {
  if (!(await fs.pathExists(dir))) {
    throw new Error(`[MCP] Skills directory not found: ${dir}`);
  }

  const entries = await fs.readdir(dir, { withFileTypes: true });
  const skills: SkillArtifact[] = [];

  for (const entry of entries.sort((a, b) => compareNames(a.name, b.name))) {
    if (entry.name.startsWith('.')) continue;
    const skillDir = path.join(dir, entry.name);
    // Follow a symlinked skill directory at the top level (common for shared
    // skills); symlinks inside a skill are skipped by readSkillFiles.
    if (!(await fs.stat(skillDir)).isDirectory()) continue;

    skills.push(await loadSkillDir(skillDir));
  }

  return skills;
}

export interface BuildSkillsOptions {
  /** Include the built-in docs-research skill */
  builtin: boolean;
  /** Absolute path to a directory of skill directories */
  dir?: string;
  /** Site title used in the built-in skill */
  siteTitle: string;
}

/**
 * Build the `skills.json` artifact. Author skills override the built-in skill
 * when they share its name.
 */
export async function buildSkillsArtifact(options: BuildSkillsOptions): Promise<SkillsArtifact> {
  const byName = new Map<string, SkillArtifact>();

  if (options.builtin) {
    const builtinDir = path.join(await findBuiltinSkillsDir(), BUILTIN_SKILL_NAME);
    const skill = await loadSkillDir(builtinDir, (md) =>
      renderSkillTemplate(md, options.siteTitle)
    );
    byName.set(skill.frontmatter.name, skill);
  }

  if (options.dir) {
    for (const skill of await loadSkillsDir(options.dir)) {
      if (byName.has(skill.frontmatter.name)) {
        console.log(`[MCP] Skill "${skill.frontmatter.name}" overrides the built-in skill`);
      }
      byName.set(skill.frontmatter.name, skill);
    }
  }

  return { version: 1, skills: [...byName.values()] };
}
