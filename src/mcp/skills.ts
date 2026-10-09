/**
 * Runtime support for the MCP skills extension (`io.modelcontextprotocol/skills`, SEP-2640).
 *
 * Serves the skills packaged at build time (`skills.json`):
 * - every skill file as a `skill://<skill-path>/<file-path>` resource
 * - `skills/list`: all skill entries (frontmatter + per-file digests and sizes)
 * - `skills/get`: one entry by its SKILL.md URI
 *
 * Edge-safe: no Node built-ins. `resources/directory/read` is not implemented,
 * so the extension is declared without `directoryRead`.
 */

import * as z from 'zod';
import {
  ProtocolError,
  ProtocolErrorCode,
  type CacheHint,
  type McpServer,
} from '@modelcontextprotocol/server';
import type { SkillArtifact, SkillFile, SkillsArtifact } from '../types/index.js';

const SKILLS_EXTENSION_ID = 'io.modelcontextprotocol/skills';

/** Scheme of every skill file URI (`skill://<skill-path>/<file-path>`) */
export const SKILL_URI_PREFIX = 'skill://';

/**
 * First protocol revision whose results carry `ttlMs`/`cacheScope` (SEP-2549).
 * Revisions are ISO dates, so string comparison orders them.
 */
const FIRST_CACHE_HINT_REVISION = '2026-07-28';

/** A skill entry as returned by skills/list and skills/get */
interface SkillEntry {
  uri: string;
  frontmatter: SkillArtifact['frontmatter'];
  resources: Array<{ uri: string; digest: string; size: number }>;
}

/** The `skill://` URI of one file in a skill. The only place the URI format is defined. */
export function skillFileUri(skill: SkillArtifact, filePath: string): string {
  return `skill://${skill.skillPath}/${filePath}`;
}

function skillUri(skill: SkillArtifact): string {
  return skillFileUri(skill, 'SKILL.md');
}

function toSkillEntry(skill: SkillArtifact): SkillEntry {
  return {
    uri: skillUri(skill),
    frontmatter: skill.frontmatter,
    resources: skill.files.map((file) => ({
      uri: skillFileUri(skill, file.path),
      digest: file.digest,
      size: file.size,
    })),
  };
}

/**
 * Pointer appended to the server instructions so clients without the skills
 * extension can still find the skills. It names `docs_fetch` first: many
 * hosts let only the user, not the model, read resources, but every host lets
 * the model call tools.
 */
export function skillsInstructions(skills: SkillArtifact[]): string {
  const lines = [
    'This server publishes Agent Skills with step-by-step guidance for using its tools. Before starting a matching task, read the skill: call docs_fetch with its skill:// URI (or use resources/read if your client supports it). Links inside a skill resolve against its URI, so references/setup.md in skill://example/SKILL.md is skill://example/references/setup.md.',
    ...skills.map((skill) => `- ${skillUri(skill)}: ${skill.frontmatter.description}`),
  ];
  return lines.join('\n');
}

const ListParams = z.looseObject({ cursor: z.string().optional() }).optional();
const GetParams = z.looseObject({ uri: z.string() });

interface RegisterSkillsOptions {
  /** ttlMs/cacheScope for skills/list and skill resources (2026-07-28 responses only) */
  cacheHint: Required<CacheHint>;
}

/** resources/read contents for one skill file. Fails loudly on a malformed skills.json. */
function toResourceContents(uri: string, file: SkillFile) {
  if (file.text !== undefined) {
    return { uri, mimeType: file.mimeType, text: file.text };
  }
  if (file.blob !== undefined) {
    return { uri, mimeType: file.mimeType, blob: file.blob };
  }
  throw new ProtocolError(
    ProtocolErrorCode.InternalError,
    `Skill file ${uri} has no content in skills.json`
  );
}

/**
 * Register skill resources and the skills/list + skills/get methods on a
 * server instance. The caller must declare the `resources` capability and the
 * extension (see {@link skillsCapabilities}).
 */
export function registerSkills(
  server: McpServer,
  artifact: SkillsArtifact,
  { cacheHint }: RegisterSkillsOptions
): void {
  const entries = new Map<string, SkillEntry>();

  for (const skill of artifact.skills) {
    const entry = toSkillEntry(skill);
    entries.set(entry.uri, entry);

    for (const file of skill.files) {
      const uri = skillFileUri(skill, file.path);
      const isSkillMd = file.path === 'SKILL.md';

      // SEP-2640: a SKILL.md resource's name SHOULD be the frontmatter name.
      server.registerResource(
        isSkillMd ? skill.frontmatter.name : `${skill.frontmatter.name}/${file.path}`,
        uri,
        {
          mimeType: file.mimeType,
          size: file.size,
          ...(isSkillMd ? { description: skill.frontmatter.description } : {}),
          cacheHint,
        },
        async () => ({ contents: [toResourceContents(uri, file)] })
      );
    }
  }

  // Every entry fits in one page; any incoming cursor is ignored. The SDK's
  // cacheHints only cover core methods, so the extension adds its own, and
  // (per SEP-2640) only on 2026-07-28 and later.
  server.server.setRequestHandler('skills/list', { params: ListParams }, async () => {
    const skills = [...entries.values()];
    const version = server.server.getNegotiatedProtocolVersion();
    return version !== undefined && version >= FIRST_CACHE_HINT_REVISION
      ? { skills, ttlMs: cacheHint.ttlMs, cacheScope: cacheHint.cacheScope }
      : { skills };
  });

  server.server.setRequestHandler('skills/get', { params: GetParams }, async ({ uri }) => {
    const skill = entries.get(uri);
    if (!skill) {
      throw new ProtocolError(ProtocolErrorCode.InvalidParams, `Unknown skill: ${uri}`);
    }
    return { skill };
  });
}

/** Capabilities to declare when serving skills */
export function skillsCapabilities() {
  return {
    resources: { listChanged: false },
    extensions: { [SKILLS_EXTENSION_ID]: {} },
  };
}
