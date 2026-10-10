/**
 * Agent guides through the whole build: pages rendered from the theme
 * components, written as a Docusaurus build directory, run through
 * buildOutputs, written, and checked by docusaurus-mcp-verify.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { AgentGuide, Check, DoneWhen, Step, Symptom } from '../src/theme/index.js';
import {
  buildOutputs,
  resolvePluginOptions,
  type SiteInfo,
} from '../src/pipeline/build-outputs.js';
import { GuideValidationError } from '../src/guides/compile.js';
import { SkillValidationError } from '../src/skills/packager.js';
import { writeArtifactBundle } from '../src/artifacts/node.js';
import { verifyBuild } from '../src/cli/verify-build.js';
import { McpDocsServer } from '../src/mcp/server.js';
import type { McpServerPluginOptions } from '../src/types/index.js';

let outDir: string;
let siteDir: string;
const warnings: string[] = [];

beforeEach(async () => {
  siteDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mcp-guides-'));
  outDir = path.join(siteDir, 'build');
  warnings.length = 0;
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation((...args: unknown[]) => {
    warnings.push(args.map(String).join(' '));
  });
});

afterEach(async () => {
  vi.restoreAllMocks();
  await fs.rm(siteDir, { recursive: true, force: true });
});

async function writePage(route: string, title: string, body: ReactElement) {
  const dir = path.join(outDir, ...route.split('/').filter(Boolean));
  await fs.mkdir(dir, { recursive: true });
  const html = `<!doctype html><html><head><title>${title}</title></head><body><article><h1>${title}</h1><p>Some introduction to this page, long enough to keep it.</p>${renderToStaticMarkup(body)}</article></body></html>`;
  await fs.writeFile(path.join(dir, 'index.html'), html);
}

const site: SiteInfo = {
  siteDir: '',
  url: 'https://docs.example.com',
  baseUrl: '/',
  title: 'Example',
};

function build(options: McpServerPluginOptions = {}) {
  return buildOutputs({
    outDir,
    options: resolvePluginOptions(options),
    site: { ...site, siteDir },
  });
}

const setupGuide = (name = 'setup-widget', checked = true, symptoms = 'not-found') => (
  <AgentGuide
    name={name}
    kind="setup"
    description="Install the widget. Use when the user wants the widget."
  >
    <DoneWhen>The widget prints its version.</DoneWhen>
    <Step id="install" title="Install it" symptoms={symptoms}>
      <pre>
        <code>npm install widget</code>
      </pre>
      {checked ? (
        <Check>
          <code>widget --version</code> prints a version.
        </Check>
      ) : null}
    </Step>
  </AgentGuide>
);

const symptomPage = (
  <Symptom id="not-found" guide="setup-widget" title="`command not found: widget`">
    <p>
      <strong>Fix:</strong> Open a new terminal.
    </p>
  </Symptom>
);

describe('agent guides in the build', () => {
  it('packages each guide as a skill next to the built-in one, served over MCP', async () => {
    await writePage('/docs/setup', 'Set up the widget', setupGuide());
    await writePage('/docs/troubleshooting', 'Troubleshooting', symptomPage);

    const result = await build();
    if (result.kind !== 'built') throw new Error(result.reason);
    const skills = result.bundle.skills!.skills;
    expect(skills.map((s) => s.skillPath)).toEqual(['docs-research', 'setup-widget']);
    expect(skills[1]!.frontmatter).toMatchObject({
      name: 'setup-widget',
      metadata: { 'agent-guide': 'setup', source: 'https://docs.example.com/docs/setup' },
    });
    expect(skills[1]!.files.map((f) => f.path)).toEqual([
      'SKILL.md',
      'references/troubleshooting.md',
    ]);
    expect(result.bundle.manifest).toMatchObject({ skillCount: 2, guideCount: 1 });
    expect(result.bundle.manifest.guideWarnings).toBeUndefined();

    // Served like any skill, and readable through docs_fetch.
    const server = new McpDocsServer({ artifacts: result.bundle });
    const response = await server.handleWebRequest(
      new Request('https://localhost/mcp', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json, text/event-stream',
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'tools/call',
          params: { name: 'docs_fetch', arguments: { url: 'skill://setup-widget/SKILL.md' } },
        }),
      })
    );
    const body = (await response.json()) as { result: { content: Array<{ text: string }> } };
    const text = body.result.content[0]!.text;
    expect(text).toMatch(/^---\nname: setup-widget\n/);
    expect(text).toContain('### 1. Install it {#install}');
    expect(text).toContain(
      '**If the check fails:** see [`command not found: widget`](references/troubleshooting.md#not-found).'
    );
  });

  it('fails the build with every guide problem at once', async () => {
    await writePage(
      '/docs/broken',
      'Broken',
      <AgentGuide name="Bad_Name" kind="setup" description="d">
        <Step id="a" title="A">
          <p>Do it.</p>
        </Step>
      </AgentGuide>
    );
    await writePage('/docs/orphan', 'Orphan', symptomPage);

    const error = await build().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(GuideValidationError);
    const { problems, message } = error as GuideValidationError;
    expect(problems).toEqual([
      `/docs/broken: guide "Bad_Name" name "Bad_Name" isn't a valid skill name (1-64 lowercase letters, digits, and single hyphens)`,
      '/docs/broken: guide "Bad_Name" has no <DoneWhen>',
      '/docs/orphan: <Symptom id="not-found"> names guide "setup-widget", which doesn\'t exist',
    ]);
    expect(message).toContain(
      'See https://docusaurus-plugin-mcp-server.vercel.app/docs/guides/agent-guides'
    );
  });

  it("fails when a guide shares a name with one of the site's skills", async () => {
    await writePage('/docs/setup', 'Set up the widget', setupGuide('docs-research', true, ''));
    await expect(build()).rejects.toThrow(SkillValidationError);
    await expect(build()).rejects.toThrow(/skill name "docs-research" is already used by/);
  });

  it('warns, and records the warnings for docusaurus-mcp-verify', async () => {
    await writePage('/docs/setup', 'Set up the widget', setupGuide('setup-widget', false, ''));

    const result = await build();
    if (result.kind !== 'built') throw new Error(result.reason);
    expect(warnings).toContain(
      '[MCP] Agent guide: /docs/setup: guide "setup-widget": step "install" has no <Check>'
    );
    expect(result.bundle.manifest.guideWarnings).toEqual([
      '/docs/setup: guide "setup-widget": step "install" has no <Check>',
      '/docs/setup: guide "setup-widget" has no symptoms',
    ]);

    await writeArtifactBundle(result.outputDir, result.bundle);
    const verified = await verifyBuild({ buildDir: outDir });
    expect(verified.success).toBe(true);
    expect(verified.warnings).toEqual([
      'Agent guide: /docs/setup: guide "setup-widget": step "install" has no <Check>',
      'Agent guide: /docs/setup: guide "setup-widget" has no symptoms',
    ]);
  });

  it("warns that guides aren't served when skills are off", async () => {
    await writePage('/docs/setup', 'Set up the widget', setupGuide());
    await writePage('/docs/troubleshooting', 'Troubleshooting', symptomPage);
    const result = await build({ skills: false });
    if (result.kind !== 'built') throw new Error(result.reason);
    expect(result.bundle.skills).toBeUndefined();
    expect(result.bundle.manifest.guideCount).toBeUndefined();
    expect(warnings).toContain(
      "[MCP] Found 1 agent guide(s), but skills are disabled (skills: false), so they aren't served"
    );
  });
});
