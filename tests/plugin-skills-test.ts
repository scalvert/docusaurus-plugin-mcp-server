import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { LoadContext, Plugin } from '@docusaurus/types';
import mcpServerPlugin from '../src/plugin/docusaurus-plugin.js';
import type { McpServerPluginOptions, SkillsArtifact } from '../src/types/index.js';

const page = (title: string) => `<!doctype html><html><head><title>${title} | Example</title></head>
<body><article><h1>${title}</h1><p>${'Welcome to the example documentation. '.repeat(5)}</p></article></body></html>`;
const PAGE = page('Intro');

// Indexer and server progress logs are expected here; keep test output readable.
beforeAll(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
});
afterAll(() => {
  vi.restoreAllMocks();
});

describe('plugin postBuild: skills.json', () => {
  let siteDir: string;
  let outDir: string;

  beforeEach(async () => {
    siteDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mcp-site-'));
    outDir = path.join(siteDir, 'build');
    await fs.mkdir(path.join(outDir, 'docs', 'intro'), { recursive: true });
    await fs.writeFile(path.join(outDir, 'docs', 'intro', 'index.html'), PAGE);
  });

  afterEach(async () => {
    await fs.rm(siteDir, { recursive: true, force: true });
  });

  async function runBuild(
    options: McpServerPluginOptions,
    siteConfig: Record<string, string> = {}
  ) {
    const context = {
      siteDir,
      siteConfig: {
        url: 'https://docs.example.com',
        baseUrl: '/',
        title: 'Example Docs',
        ...siteConfig,
      },
    } as unknown as LoadContext;
    const plugin = mcpServerPlugin(context, options) as Plugin & {
      postBuild: (props: { outDir: string }) => Promise<void>;
    };
    await plugin.postBuild({ outDir } as never);
  }

  const readJson = async <T>(file: string) =>
    JSON.parse(await fs.readFile(path.join(outDir, 'mcp', file), 'utf8')) as T;

  it('writes the built-in skill by default and records skillCount in the manifest', async () => {
    await runBuild({});

    const skills = await readJson<SkillsArtifact>('skills.json');
    expect(skills.skills.map((s) => s.frontmatter.name)).toEqual(['docs-research']);
    expect(skills.skills[0]?.frontmatter.description).toContain(
      'Answer questions using the Example Docs at docs.example.com.'
    );

    const manifest = await readJson<{ skillCount?: number }>('manifest.json');
    expect(manifest.skillCount).toBe(1);
  });

  it('packages skills from a site-relative dir', async () => {
    const skillDir = path.join(siteDir, 'mcp-skills', 'deploying');
    await fs.mkdir(skillDir, { recursive: true });
    await fs.writeFile(
      path.join(skillDir, 'SKILL.md'),
      '---\nname: deploying\ndescription: Deploy the example app\n---\n\n# Deploying\n'
    );

    await runBuild({ skills: { dir: 'mcp-skills' } });

    const skills = await readJson<SkillsArtifact>('skills.json');
    expect(skills.skills.map((s) => s.frontmatter.name)).toEqual(['docs-research', 'deploying']);
  });

  it('gives the built-in skill a site map whose links docs_fetch can serve', async () => {
    for (const route of ['guides', 'guides/setup', 'guides/deploy', 'api/search', 'api/index']) {
      const dir = path.join(outDir, route);
      await fs.mkdir(dir, { recursive: true });
      const title = route.split('/').pop()!;
      await fs.writeFile(
        path.join(dir, 'index.html'),
        page(title[0]!.toUpperCase() + title.slice(1))
      );
    }

    await runBuild({}, { baseUrl: '/v2/', tagline: 'Docs for the example app' });

    const skills = await readJson<SkillsArtifact>('skills.json');
    const skill = skills.skills[0]!;
    expect(skill.frontmatter.description).toContain(
      'the Example Docs at docs.example.com/v2 (Docs for the example app)'
    );
    const text = skill.files[0]?.text ?? '';
    expect(text).toContain('## Where things are');

    const docs = await readJson<Record<string, unknown>>('docs.json');
    const links = [...text.matchAll(/\]\((https:[^)]+)\)/g)].map((m) => m[1]);
    expect(links).toEqual(['https://docs.example.com/v2/guides']);
    for (const link of links) expect(docs).toHaveProperty([link!]);
  });

  it('writes no skills.json when skills: false', async () => {
    await runBuild({ skills: false });

    await expect(fs.access(path.join(outDir, 'mcp', 'skills.json'))).rejects.toThrow();
    const manifest = await readJson<{ skillCount?: number }>('manifest.json');
    expect(manifest.skillCount).toBeUndefined();
  });
});
