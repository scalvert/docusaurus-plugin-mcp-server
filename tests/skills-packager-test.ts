import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
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
import {
  builtinTemplateVars,
  findBuiltinSkillsDir,
  renderSkillTemplate,
} from '../src/skills/builtin.js';

const vars = (title: string) => builtinTemplateVars({ title });

const sha256 = (bytes: Buffer) => `sha256:${createHash('sha256').update(bytes).digest('hex')}`;

const skillMd = (name: string, extra = '') =>
  `---\nname: ${name}\ndescription: Does ${name} things\n${extra}---\n\n# ${name}\n`;

const canSymlink = await (async () => {
  const probe = await fs.mkdtemp(path.join(os.tmpdir(), 'mcp-symlink-'));
  try {
    await fs.symlink(probe, path.join(probe, 'link'));
    return true;
  } catch {
    return false;
  } finally {
    await fs.rm(probe, { recursive: true, force: true });
  }
})();

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

    const skill = packageSkill('guide', [
      { path: 'references/api.md', bytes: ref },
      { path: 'assets/logo.png', bytes: png },
      { path: 'SKILL.md', bytes: md },
    ]);

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
      packageSkill('other', [{ path: 'SKILL.md', bytes: Buffer.from(skillMd('guide')) }])
    ).toThrow(/must match the directory name/);
  });

  it('requires SKILL.md', () => {
    expect(() => packageSkill('guide', [{ path: 'README.md', bytes: Buffer.from('x') }])).toThrow(
      /missing SKILL.md/
    );
  });

  it('enforces the per-skill file limit', () => {
    const files = [{ path: 'SKILL.md', bytes: Buffer.from(skillMd('big')) }];
    for (let i = 0; i < MAX_SKILL_FILES; i++) {
      files.push({ path: `f${i}.md`, bytes: Buffer.from('x') });
    }
    expect(() => packageSkill('big', files)).toThrow(/file limit/);
  });
});

describe('renderSkillTemplate', () => {
  const template =
    "---\nname: guide\ndescription: 'Answers about {{siteTitle}}'\n---\n\n# {{siteTitle}} guide\n";

  it('fills {{siteTitle}} in frontmatter and body', () => {
    const markdown = renderSkillTemplate(template, vars('Example'));
    expect(parseSkillFrontmatter(markdown, 'x').description).toBe('Answers about Example');
    expect(markdown).toContain('# Example guide');
    expect(markdown).not.toContain('{{siteTitle}}');
  });

  it('escapes site titles containing YAML syntax', () => {
    const markdown = renderSkillTemplate(template, vars('Acme: "Docs" #1'));
    expect(parseSkillFrontmatter(markdown, 'x').description).toBe('Answers about Acme: "Docs" #1');
  });

  it('frontmatter round-trips through a plain YAML parse', () => {
    const markdown = renderSkillTemplate(template, vars('Example'));
    const yamlBlock = markdown.split('---')[1] ?? '';
    expect(parseYaml(yamlBlock)).toEqual(parseSkillFrontmatter(markdown, 'x'));
  });

  it('falls back to "this site" for an empty title', () => {
    expect(renderSkillTemplate(template, vars('  '))).toContain('# this site guide');
  });

  it('leaves no extra blank lines where a placeholder renders empty', () => {
    const md = '---\nname: g\ndescription: d\n---\n\n# A\n\n{{siteMap}}\n\n## B\n';
    expect(renderSkillTemplate(md, vars('Example'))).toContain('# A\n\n## B\n');
  });

  it('keeps intentional blank lines elsewhere in the body', () => {
    const md = '---\nname: g\ndescription: d\n---\n\n```\na\n\n\nb\n```\n';
    expect(renderSkillTemplate(md, vars('Example'))).toContain('a\n\n\nb');
  });

  it('leaves unknown placeholders alone', () => {
    const md = '---\nname: g\ndescription: d\n---\n\n{{other}} {{siteTitle}}\n';
    expect(renderSkillTemplate(md, vars('Example'))).toContain('{{other}} Example');
  });
});

describe('builtinTemplateVars', () => {
  it('names the docs, host and tagline for the description', () => {
    const v = builtinTemplateVars({
      title: 'Acme',
      url: 'https://acme.dev/docs/',
      tagline: 'Build faster.',
    });
    expect(v.siteDocs).toBe('the Acme documentation');
    expect(v.siteSummary).toBe('the Acme documentation at acme.dev/docs (Build faster)');
  });

  it('skips a missing tagline, one that repeats the title, and the Docusaurus default', () => {
    for (const tagline of [undefined, '  ', 'Acme', 'Dinosaurs are cool']) {
      expect(
        builtinTemplateVars({ title: 'Acme', url: 'https://acme.dev/', tagline }).siteSummary
      ).toBe('the Acme documentation at acme.dev');
    }
  });

  it('does not repeat "documentation" for titles that already name the docs', () => {
    expect(builtinTemplateVars({ title: 'Acme Docs' }).siteDocs).toBe('the Acme Docs');
    expect(builtinTemplateVars({ title: 'Acme Documentation' }).siteDocs).toBe(
      'the Acme Documentation'
    );
    expect(builtinTemplateVars({ title: 'Docsify' }).siteDocs).toBe('the Docsify documentation');
  });

  it('reads naturally without a title or URL', () => {
    const v = builtinTemplateVars({ title: '' });
    expect(v.siteSummary).toBe("this site's documentation");
    expect(v.siteMap).toBe('');
  });
});

describe('built-in skills directory', () => {
  it('is found from the source tree', async () => {
    const dir = await findBuiltinSkillsDir();
    expect(path.basename(dir)).toBe('skills-builtin');
  });

  it('is found from a nested location such as dist/', async () => {
    const root = path.dirname(await findBuiltinSkillsDir());
    const dir = await findBuiltinSkillsDir(path.join(root, 'dist'));
    expect(dir).toBe(path.join(root, 'skills-builtin'));
  });

  it('ships a docs-research skill whose template renders to a valid skill', async () => {
    const file = path.join(await findBuiltinSkillsDir(), 'docs-research', 'SKILL.md');
    const template = await fs.readFile(file, 'utf8');
    const markdown = renderSkillTemplate(
      template,
      builtinTemplateVars({
        title: 'Example',
        url: 'https://example.com/',
        docs: [
          { route: '/guides', title: 'Guides' },
          { route: '/guides/setup', title: 'Setup' },
          { route: '/api/search', title: 'Search' },
          { route: '/api/index', title: 'Index' },
        ],
      })
    );
    const fm = parseSkillFrontmatter(markdown, file);
    expect(fm.name).toBe('docs-research');
    expect(fm.description).toBe(
      'Answer questions using the Example documentation at example.com. Use when the user asks about anything these docs cover, or wants answers backed by links to the docs.'
    );
    expect(markdown).toContain('# Researching the Example documentation');
    expect(markdown).toContain('## Where things are');
    expect(markdown).toContain('docs_search');
    expect(markdown).not.toMatch(/\{\{\w+\}\}/);
    expect(markdown).not.toMatch(/\n{3,}/);
  });
});

describe('buildSkillsArtifact', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'mcp-skills-'));
  });

  afterEach(async () => {
    vi.restoreAllMocks();
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
    expect(artifact.skills[0]?.files[0]?.text).not.toContain('## Where things are');
  });

  it('gives the built-in skill a site map when pages and a site URL are passed', async () => {
    const artifact = await buildSkillsArtifact({
      builtin: true,
      siteTitle: 'Example',
      siteUrl: 'https://example.com/',
      siteTagline: 'Docs for Example',
      docs: [
        { route: '/guides/setup', title: 'Setup' },
        { route: '/guides/deploy', title: 'Deploy' },
        { route: '/api/search', title: 'Search' },
        { route: '/api/index', title: 'Index' },
      ],
    });
    const skill = artifact.skills[0]!;
    expect(skill.frontmatter.description).toContain('at example.com (Docs for Example)');
    expect(skill.files[0]?.text).toContain('- `/api` (2 pages): Includes Index; Search.');
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
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const artifact = await buildSkillsArtifact({ builtin: true, dir, siteTitle: 'Example' });
    expect(artifact.skills).toHaveLength(1);
    expect(artifact.skills[0]?.frontmatter.description).toBe('Does docs-research things');
    expect(log).toHaveBeenCalledWith(expect.stringContaining('overrides the built-in skill'));
  });

  it('omits the built-in skill when disabled', async () => {
    await writeSkill('only-mine', { 'SKILL.md': skillMd('only-mine') });
    const artifact = await buildSkillsArtifact({ builtin: false, dir, siteTitle: 'Example' });
    expect(artifact.skills.map((s) => s.frontmatter.name)).toEqual(['only-mine']);
  });

  // Creating symlinks on Windows needs admin rights or Developer Mode.
  it.skipIf(!canSymlink)(
    'skips symlinks inside a skill (no cycles, no escaping the skill dir)',
    async () => {
      await writeSkill('linked', { 'SKILL.md': skillMd('linked'), 'refs/a.md': '# A' });
      // A cycle back to the skill root and a link to a file outside it
      await fs.symlink(path.join(dir, 'linked'), path.join(dir, 'linked', 'refs', 'loop'));
      await fs.writeFile(path.join(dir, 'secret.txt'), 'outside');
      await fs.symlink(path.join(dir, 'secret.txt'), path.join(dir, 'linked', 'secret.txt'));
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const artifact = await buildSkillsArtifact({ builtin: false, dir, siteTitle: 'Example' });

      expect(artifact.skills[0]?.files.map((f) => f.path)).toEqual(['SKILL.md', 'refs/a.md']);
      expect(warn).toHaveBeenCalledTimes(2);
    }
  );

  it('packages scripts but warns about them', async () => {
    await writeSkill('scripted', { 'SKILL.md': skillMd('scripted'), 'scripts/run.sh': 'echo hi' });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const artifact = await buildSkillsArtifact({ builtin: false, dir, siteTitle: 'Example' });

    expect(artifact.skills[0]?.files.map((f) => f.path)).toContain('scripts/run.sh');
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('scripts/run.sh'));
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
