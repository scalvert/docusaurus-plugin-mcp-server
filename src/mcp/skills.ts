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

import { z } from 'zod';
import { ProtocolError, ProtocolErrorCode, type McpServer } from '@modelcontextprotocol/server';
import type { SkillArtifact, SkillsArtifact } from '../types/index.js';

export const SKILLS_EXTENSION_ID = 'io.modelcontextprotocol/skills';

/** A skill entry as returned by skills/list and skills/get */
export interface SkillEntry {
  uri: string;
  frontmatter: SkillArtifact['frontmatter'];
  resources: Array<{ uri: string; digest: string; size: number }>;
}

export function skillFileUri(skill: SkillArtifact, filePath: string): string {
  return `skill://${skill.skillPath}/${filePath}`;
}

export function skillUri(skill: SkillArtifact): string {
  return skillFileUri(skill, 'SKILL.md');
}

export function toSkillEntry(skill: SkillArtifact): SkillEntry {
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
 * extension can still find and read the skills via resources/read.
 */
export function skillsInstructions(skills: SkillArtifact[]): string {
  const lines = [
    'This server publishes Agent Skills with step-by-step guidance for using its tools. Read a skill with resources/read before starting a matching task:',
    ...skills.map((skill) => `- ${skillUri(skill)}: ${skill.frontmatter.description}`),
  ];
  return lines.join('\n');
}

const ListParams = z.looseObject({ cursor: z.string().optional() }).optional();
const GetParams = z.looseObject({ uri: z.string() });

export interface RegisterSkillsOptions {
  /** ttlMs/cacheScope stamped on skills/list and on skill resources */
  cacheHint: { ttlMs: number; cacheScope: 'public' | 'private' };
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

      server.registerResource(
        `${skill.frontmatter.name}/${file.path}`,
        uri,
        {
          mimeType: file.mimeType,
          size: file.size,
          ...(isSkillMd ? { description: skill.frontmatter.description } : {}),
          cacheHint,
        },
        async () => ({
          contents: [
            file.text !== undefined
              ? { uri, mimeType: file.mimeType, text: file.text }
              : { uri, mimeType: file.mimeType, blob: file.blob ?? '' },
          ],
        })
      );
    }
  }

  // Every entry fits in one page; any incoming cursor is ignored.
  server.server.setRequestHandler('skills/list', { params: ListParams }, async () => ({
    skills: [...entries.values()],
    ttlMs: cacheHint.ttlMs,
    cacheScope: cacheHint.cacheScope,
  }));

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
