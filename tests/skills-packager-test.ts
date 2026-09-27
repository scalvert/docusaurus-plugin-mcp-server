import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { parse as parseYaml } from 'yaml';
import {
  buildSkillsArtifact,
  packageSkill,
  parseSkillFrontmatter,
  SkillValidationError,
  MAX_SKILL_FILES,
} from '../src/skills/packager.js';
import { renderBuiltinSkill } from '../src/skills/builtin.js';

const sha256 = (bytes: Buffer) => `sha256:${createHash('sha256').update(bytes).digest('hex')}`;

const skillMd = (name: string, extra = '') =>
  `---\nname: ${name}\ndescription: Does ${name} things\n${extra}---\n\n# ${name}\n`;

describe('parseSkillFrontmatter', () => {
  it('returns every frontmatter field as JSON', () => {
    const fm = parseSkillFrontmatter(
      skillMd('refunds', 'license: MIT\nmetadata:\n  version: "1.2"\n'),
      'x'
    );
    expect(fm).toEqual({
      name: 'refunds',
      description: 'Does refunds things',
      license: 'MIT',
      metadata: { version: '1.2' },
    });
  });

  it.each([
    ['no frontmatter', '# Title only'],
    ['missing name', '---\ndescription: d\n---\n'],
    ['invalid name', '---\nname: Bad_Name\ndescription: d\n---\n'],
    ['double hyphen', '---\nname: a--b\ndescription: d\n---\n'],
    ['empty description', '---\nname: ok\ndescription: ""\n---\n'],
    ['non-mapping', '---\n- a\n- b\n---\n'],
    ['invalid YAML', '---\nname: [unclosed\n---\n'],
  ])('rejects %s', (_label, markdown) => {
    expect(() => parseSkillFrontmatter(markdown, 'x')).toThrow(SkillValidationError);
  });
});

describe('packageSkill', () => {
  it('orders SKILL.md first and computes digests and sizes over raw bytes', () => {
    const md = Buffer.from(skillMd('guide'));
    const ref = Buffer.from('# Reference — ünïcode\n');
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0x01]);

    const skill = packageSkill(
      'guide',
      [
        { path: 'references/api.md', bytes: ref },
        { path: 'assets/logo.png', bytes: png },
        { path: 'SKILL.md', bytes: md },
      ],
      'x'
    );

    expect(skill.skillPath).toBe('guide');
    expect(skill.files.map((f) => f.path)).toEqual([
      'SKILL.md',
      'assets/logo.png',
      'references/api.md',
    ]);

    const [skillFile, pngFile, refFile] = skill.files;
    expect(skillFile).toMatchObject({
      mimeType: 'text/markdown',
      digest: sha256(md),
      size: md.length,
    });
    expect(refFile).toMatchObject({
      text: ref.toString('utf8'),
      size: ref.length,
      digest: sha256(ref),
    });
    expect(pngFile).toMatchObject({ mimeType: 'image/png', blob: png.toString('base64') });
    expect(pngFile?.text).toBeUndefined();
  });

  it('requires the directory name to match frontmatter name', () => {
    expect(() =>
      packageSkill('other', [{ path: 'SKILL.md', bytes: Buffer.from(skillMd('guide')) }], 'x')
    ).toThrow(/must match the directory name/);
  });

  it('requires SKILL.md', () => {
    expect(() =>
      packageSkill('guide', [{ path: 'README.md', bytes: Buffer.from('x') }], 'x')
    ).toThrow(/missing SKILL.md/);
  });

  it('enforces the per-skill file limit', () => {
    const files = [{ path: 'SKILL.md', bytes: Buffer.from(skillMd('big')) }];
    for (let i = 0; i < MAX_SKILL_FILES; i++) {
      files.push({ path: `f${i}.md`, bytes: Buffer.from('x') });
    }
    expect(() => packageSkill('big', files, 'x')).toThrow(/file limit/);
  });
});

describe('renderBuiltinSkill', () => {
  it('escapes site titles in frontmatter', () => {
    const markdown = renderBuiltinSkill({ siteTitle: 'Acme: "Docs" #1' });
    const fm = parseSkillFrontmatter(markdown, 'builtin');
    expect(fm.name).toBe('docs-research');
    expect(fm.description).toContain('Acme: "Docs" #1');
  });

  it('frontmatter round-trips through a plain YAML parse', () => {
    const markdown = renderBuiltinSkill({ siteTitle: 'Example' });
    const yamlBlock = markdown.split('---')[1] ?? '';
    expect(parseYaml(yamlBlock)).toEqual(parseSkillFrontmatter(markdown, 'builtin'));
  });
});

describe('buildSkillsArtifact', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'mcp-skills-'));
  });

  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  async function writeSkill(name: string, files: Record<string, string>) {
    for (const [rel, content] of Object.entries(files)) {
      const file = path.join(dir, name, rel);
      await fs.mkdir(path.dirname(file), { recursive: true });
      await fs.writeFile(file, content);
    }
  }

  it('includes only the built-in skill by default', async () => {
    const artifact = await buildSkillsArtifact({ builtin: true, siteTitle: 'Example' });
    expect(artifact.version).toBe(1);
    expect(artifact.skills.map((s) => s.frontmatter.name)).toEqual(['docs-research']);
  });

  it('packages author skills with nested files and skips dotfiles', async () => {
    await writeSkill('api-migration', {
      'SKILL.md': skillMd('api-migration'),
      'references/v1-to-v2.md': '# Migration',
      '.DS_Store': 'junk',
    });

    const artifact = await buildSkillsArtifact({ builtin: true, dir, siteTitle: 'Example' });
    const names = artifact.skills.map((s) => s.frontmatter.name);
    expect(names).toEqual(['docs-research', 'api-migration']);

    const skill = artifact.skills[1]!;
    expect(skill.files.map((f) => f.path)).toEqual(['SKILL.md', 'references/v1-to-v2.md']);
  });

  it('lets an author skill override the built-in one', async () => {
    await writeSkill('docs-research', { 'SKILL.md': skillMd('docs-research') });
    const artifact = await buildSkillsArtifact({ builtin: true, dir, siteTitle: 'Example' });
    expect(artifact.skills).toHaveLength(1);
    expect(artifact.skills[0]?.frontmatter.description).toBe('Does docs-research things');
  });

  it('omits the built-in skill when disabled', async () => {
    await writeSkill('only-mine', { 'SKILL.md': skillMd('only-mine') });
    const artifact = await buildSkillsArtifact({ builtin: false, dir, siteTitle: 'Example' });
    expect(artifact.skills.map((s) => s.frontmatter.name)).toEqual(['only-mine']);
  });

  it('fails the build on an invalid skill', async () => {
    await writeSkill('broken', { 'SKILL.md': '# no frontmatter' });
    await expect(buildSkillsArtifact({ builtin: true, dir, siteTitle: 'Example' })).rejects.toThrow(
      /broken/
    );
  });

  it('fails when the skills directory does not exist', async () => {
    await expect(
      buildSkillsArtifact({ builtin: true, dir: path.join(dir, 'missing'), siteTitle: 'Example' })
    ).rejects.toThrow(/not found/);
  });
});
