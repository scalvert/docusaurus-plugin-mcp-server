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
import { BUILTIN_SKILL_NAME, renderBuiltinSkill } from './builtin.js';

/** Agent Skills naming rule: lowercase alphanumerics separated by single hyphens */
const SKILL_NAME_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const MAX_NAME_LENGTH = 64;
const MAX_DESCRIPTION_LENGTH = 1024;

/** Per-skill limits every conforming host must accept (SEP-2640 "Limits") */
export const MAX_SKILL_FILES = 512;
export const MAX_SKILL_BYTES = 16 * 1024 * 1024;

const FRONTMATTER_PATTERN = /^\uFEFF?---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/;

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

function toSkillFile(filePath: string, bytes: Buffer): SkillFile {
  const mimeType = mimeTypeFor(filePath);
  const digest = `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
  const base = { path: filePath, mimeType, digest, size: bytes.length };

  const looksBinary = mimeType.startsWith('image/') && mimeType !== 'image/svg+xml';
  if (!looksBinary && mimeType !== 'application/pdf' && !bytes.includes(0)) {
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
 * Package one skill from in-memory files. `files` must include `SKILL.md`.
 */
export function packageSkill(
  dirName: string,
  files: Array<{ path: string; bytes: Buffer }>,
  source: string
): SkillArtifact {
  const skillMd = files.find((f) => f.path === 'SKILL.md');
  if (!skillMd) {
    throw new SkillValidationError(source, 'missing SKILL.md at the skill root');
  }

  const frontmatter = parseSkillFrontmatter(skillMd.bytes.toString('utf8'), source);
  if (frontmatter.name !== dirName) {
    throw new SkillValidationError(
      source,
      `frontmatter name "${frontmatter.name}" must match the directory name "${dirName}"`
    );
  }

  if (files.length > MAX_SKILL_FILES) {
    throw new SkillValidationError(
      source,
      `${files.length} files exceeds the ${MAX_SKILL_FILES}-file limit`
    );
  }
  const totalBytes = files.reduce((sum, f) => sum + f.bytes.length, 0);
  if (totalBytes > MAX_SKILL_BYTES) {
    throw new SkillValidationError(
      source,
      `${totalBytes} bytes exceeds the ${MAX_SKILL_BYTES}-byte limit`
    );
  }

  const ordered = [skillMd, ...files.filter((f) => f !== skillMd).sort(comparePaths)];

  return {
    skillPath: frontmatter.name,
    frontmatter,
    files: ordered.map((f) => toSkillFile(f.path, f.bytes)),
  };
}

function comparePaths(a: { path: string }, b: { path: string }): number {
  return a.path < b.path ? -1 : a.path > b.path ? 1 : 0;
}

async function readSkillFiles(
  root: string,
  relDir = ''
): Promise<Array<{ path: string; bytes: Buffer }>> {
  const entries = await fs.readdir(path.join(root, relDir), { withFileTypes: true });
  const files: Array<{ path: string; bytes: Buffer }> = [];

  for (const entry of entries) {
    // Skip dotfiles (.DS_Store, .git, editor state).
    if (entry.name.startsWith('.')) continue;

    const rel = relDir ? `${relDir}/${entry.name}` : entry.name;
    const stat = await fs.stat(path.join(root, rel));

    if (stat.isDirectory()) {
      files.push(...(await readSkillFiles(root, rel)));
    } else if (stat.isFile()) {
      files.push({ path: rel, bytes: await fs.readFile(path.join(root, rel)) });
    }
  }

  return files;
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

  for (const entry of entries.sort((a, b) => (a.name < b.name ? -1 : 1))) {
    if (entry.name.startsWith('.')) continue;
    const skillDir = path.join(dir, entry.name);
    if (!(await fs.stat(skillDir)).isDirectory()) continue;

    const files = await readSkillFiles(skillDir);
    skills.push(packageSkill(entry.name, files, skillDir));
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
    const markdown = renderBuiltinSkill({ siteTitle: options.siteTitle });
    byName.set(
      BUILTIN_SKILL_NAME,
      packageSkill(
        BUILTIN_SKILL_NAME,
        [{ path: 'SKILL.md', bytes: Buffer.from(markdown, 'utf8') }],
        'built-in'
      )
    );
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
