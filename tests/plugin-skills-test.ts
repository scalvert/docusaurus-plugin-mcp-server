import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { LoadContext, Plugin } from '@docusaurus/types';
import mcpServerPlugin from '../src/plugin/docusaurus-plugin.js';
import type { McpServerPluginOptions, SkillsArtifact } from '../src/types/index.js';

const PAGE = `<!doctype html><html><head><title>Intro | Example</title></head>
<body><article><h1>Intro</h1><p>${'Welcome to the example documentation. '.repeat(5)}</p></article></body></html>`;

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

  async function runBuild(options: McpServerPluginOptions) {
    const context = {
      siteDir,
      siteConfig: { url: 'https://docs.example.com', baseUrl: '/', title: 'Example Docs' },
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
    expect(skills.skills[0]?.frontmatter.description).toContain('Example Docs');

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

  it('writes no skills.json when skills: false', async () => {
    await runBuild({ skills: false });

    await expect(fs.access(path.join(outDir, 'mcp', 'skills.json'))).rejects.toThrow();
    const manifest = await readJson<{ skillCount?: number }>('manifest.json');
    expect(manifest.skillCount).toBeUndefined();
  });
});
