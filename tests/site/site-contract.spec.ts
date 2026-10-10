/**
 * Contract tests for this repo's docs site, over its real MCP function
 * (website/api/mcp.mjs) on the built bundle (playwright.site.config.ts).
 *
 * They check what an agent connected to the site gets: every agent guide the
 * site compiles is served, matches the copy in skills/guides/ that
 * `npx skills add` installs, is reachable by hosts with and without the skills
 * extension, links only to pages and anchors that exist, and is found by
 * searching for what someone would ask.
 *
 * Whether an agent can follow a guide is a different question: see
 * tests/evals/ for the evals that run a model or a coding agent.
 */

import fs from 'node:fs';
import path from 'node:path';
import { test, expect, extractText, runConformanceChecks } from '@gleanwork/mcp-server-tester';
import type { MCPFixtureApi } from '@gleanwork/mcp-server-tester';

const SITE = 'https://docusaurus-plugin-mcp-server.vercel.app';
const repo = path.resolve(import.meta.dirname, '..', '..');
const guidesDir = path.join(repo, 'skills', 'guides');
const manifestPath = path.join(repo, 'website', 'build', 'mcp', 'manifest.json');

/** What someone might ask, per guide; search should find the guide's page for it. */
const GUIDE_QUERIES: Record<string, string[]> = {
  'setup-docusaurus-mcp': ['set up an MCP server for my Docusaurus docs', 'getting started'],
  'deploy-docusaurus-mcp-vercel': ['deploy to Vercel'],
  'deploy-docusaurus-mcp-netlify': ['deploy to Netlify'],
  'deploy-docusaurus-mcp-cloudflare': ['deploy to Cloudflare Workers'],
  'deploy-docusaurus-mcp-static-host': ['GitHub Pages'],
  'write-docusaurus-agent-guide': ['write an agent guide'],
};

/** Symptoms someone would describe, and the page that covers them. */
const SYMPTOM_QUERIES: Array<[query: string, page: string]> = [
  ['/mcp returns 404', '/docs/deploy/troubleshooting'],
  ['Tool calls return 406 Not Acceptable', '/docs/deploy/troubleshooting'],
  ['blocked by CORS', '/docs/deploy/troubleshooting'],
];

/** The guides in skills/guides/, each with its files (relative paths) and their text. */
function repoGuides(): Map<string, Map<string, string>> {
  const guides = new Map<string, Map<string, string>>();
  for (const name of fs.readdirSync(guidesDir).sort()) {
    const dir = path.join(guidesDir, name);
    if (!fs.statSync(dir).isDirectory()) continue;
    const files = new Map<string, string>();
    for (const file of fs.readdirSync(dir, { recursive: true }) as string[]) {
      const full = path.join(dir, file);
      if (fs.statSync(full).isFile()) {
        files.set(file.split(path.sep).join('/'), fs.readFileSync(full, 'utf8'));
      }
    }
    guides.set(name, files);
  }
  return guides;
}

const guides = repoGuides();

/** Markdown link targets in a file, outside code blocks. */
function linkTargets(markdown: string): string[] {
  const prose = markdown.replace(/^(```|~~~)[\s\S]*?^\1/gm, '');
  return [...prose.matchAll(/\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)].map((m) => m[1]!);
}

/** The first `limit` result URLs of a docs_search answer, without the site origin. */
async function searchPages(mcp: MCPFixtureApi, query: string, limit = 3): Promise<string[]> {
  const text = extractText(await mcp.callTool('docs_search', { query, limit }));
  return [...text.matchAll(/URL: (\S+)/g)].map((m) => m[1]!.replace(SITE, '').replace(/\/$/, ''));
}

test('passes conformance checks, including the skills extension, with no warnings', async ({
  mcp,
}, testInfo) => {
  const result = await runConformanceChecks(
    mcp,
    { requiredTools: ['docs_search', 'docs_fetch'], skills: { verifyFiles: 'all' } },
    testInfo
  );
  const problems = result.checks.filter((c) => !c.pass && !c.skipped);
  expect(problems, JSON.stringify(problems, null, 2)).toEqual([]);
});

test('the build compiled every guide without warnings', () => {
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as {
    guideWarnings?: string[];
  };
  expect(manifest.guideWarnings ?? []).toEqual([]);
});

test('serves every guide in skills/guides/, and the built-in skill', async ({ mcp }) => {
  const served = (await mcp.skills.list()).map((entry) => String(entry.frontmatter.name)).sort();
  expect(served).toEqual([...guides.keys(), 'docs-research'].sort());
});

test('each served guide is exactly the copy in skills/guides/', async ({ mcp }) => {
  const entries = await mcp.skills.list();
  const problems: string[] = [];
  for (const [name, files] of guides) {
    const entry = entries.find((e) => e.frontmatter.name === name);
    const metadata = entry?.frontmatter.metadata as Record<string, unknown> | undefined;
    if (!metadata?.['agent-guide']) problems.push(`${name}: not marked as an agent guide`);

    const listed =
      entry && entry.resources !== 'dynamic'
        ? entry.resources.map((r) => r.uri.replace(`skill://${name}/`, '')).sort()
        : [];
    expect(listed, `${name}: served files`).toEqual([...files.keys()].sort());

    for (const [file, text] of files) {
      const read = await mcp.skills.read(`skill://${name}/${file}`);
      if (read.verified !== true) problems.push(`${name}/${file}: digest or size doesn't match`);
      if (read.text !== text) problems.push(`${name}/${file}: differs from skills/guides/`);
    }
  }
  expect(problems).toEqual([]);
});

test('hosts without the skills extension can find and read every guide', async ({ mcp }) => {
  // The server instructions list each skill:// URI, and docs_fetch reads it.
  const instructions = mcp.client.getInstructions() ?? '';
  const problems: string[] = [];
  for (const [name, files] of guides) {
    const uri = `skill://${name}/SKILL.md`;
    if (!instructions.includes(uri)) problems.push(`${uri}: not in the server instructions`);
    const text = extractText(await mcp.callTool('docs_fetch', { url: uri }));
    if (text !== files.get('SKILL.md')) problems.push(`${uri}: docs_fetch returns something else`);
  }
  expect(problems).toEqual([]);
});

test('every link in a guide resolves to a page, section, or file that exists', async ({ mcp }) => {
  const problems: string[] = [];
  let checked = 0;
  for (const [name, files] of guides) {
    for (const [file, markdown] of files) {
      for (const target of linkTargets(markdown)) {
        const [base, fragment] = target.split('#') as [string, string | undefined];
        const where = `${name}/${file} → ${target}`;

        if (base.startsWith(SITE)) {
          checked++;
          // A section comes back as "# Page: Section", then a "> Section #id of <url>"
          // note; a missing one as "> No section #id on this page" and the whole page.
          const text = extractText(await mcp.callTool('docs_fetch', { url: target }));
          if (text.startsWith('Page not found')) problems.push(`${where}: no such page`);
          else if (fragment && !text.includes(`\n> Section #${fragment} of `))
            problems.push(`${where}: no such section`);
        } else if (!/^[a-z]+:/i.test(base)) {
          // Relative: another file in the same skill, or an anchor in this one.
          checked++;
          const targetFile = base === '' ? file : path.posix.join(path.posix.dirname(file), base);
          const targetText = files.get(targetFile);
          if (targetText === undefined) problems.push(`${where}: no such file in the skill`);
          else if (fragment && !targetText.includes(`{#${fragment}}`))
            problems.push(`${where}: no {#${fragment}} anchor in ${targetFile}`);
        }
        // Other sites (GitHub, platform docs) are out of scope here.
      }
    }
  }
  expect(problems, `${problems.length} of ${checked} links`).toEqual([]);
  expect(checked).toBeGreaterThan(0);
});

test('searching for what someone would ask finds the guide', async ({ mcp }) => {
  const entries = await mcp.skills.list();
  expect(Object.keys(GUIDE_QUERIES).sort(), 'a query for every guide').toEqual([...guides.keys()]);

  const problems: string[] = [];
  for (const [name, queries] of Object.entries(GUIDE_QUERIES)) {
    const entry = entries.find((e) => e.frontmatter.name === name);
    const metadata = entry?.frontmatter.metadata as Record<string, unknown> | undefined;
    const page = String(metadata?.source ?? '').replace(SITE, '');
    for (const query of queries) {
      const pages = await searchPages(mcp, query);
      if (!pages.includes(page))
        problems.push(`"${query}": ${page} not in top 3 (${pages.join(', ')})`);
    }
  }
  for (const [query, page] of SYMPTOM_QUERIES) {
    const pages = await searchPages(mcp, query);
    if (!pages.includes(page))
      problems.push(`"${query}": ${page} not in top 3 (${pages.join(', ')})`);
  }
  expect(problems).toEqual([]);
});
