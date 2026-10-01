/**
 * Golden test for page extraction: a real Docusaurus build (see
 * tests/fixtures/extract/README.md) in, documents and search results out.
 *
 * The expected files are the contract. A change that alters them must be
 * intended, and the diff reviewed. Regenerate with:
 *   npx vitest run tests/extract-golden-test.ts -u
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { LoadContext, Plugin } from '@docusaurus/types';
import mcpServerPlugin from '../src/plugin/docusaurus-plugin.js';
import { loadLocalSearchIndex, searchLocalIndex } from '../src/search/local-search.js';
import type { McpServerPluginOptions, ProcessedDoc } from '../src/types/index.js';

const SITE = path.join(import.meta.dirname, 'fixtures', 'extract', 'site');
const EXPECTED = path.join(import.meta.dirname, 'fixtures', 'extract', 'expected');

/** Queries whose rankings pin what the extracted text and headings feed into search. */
const QUERIES = [
  'install',
  'api key authentication',
  'setup',
  'custom heading',
  'rate limit',
  'endpoints pagination',
  'configuration options',
  'details summary',
  'foo',
  'nested deep',
];

let tmp: string;
const warnings: string[] = [];

beforeAll(async () => {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'mcp-extract-golden-'));
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation((...args: unknown[]) => {
    warnings.push(args.map(String).join(' ').replaceAll(tmp, '<out>').replaceAll('\\', '/'));
  });
});

afterAll(async () => {
  vi.restoreAllMocks();
  await fs.rm(tmp, { recursive: true, force: true });
});

/** Run the plugin's postBuild over a copy of the fixture site; return the bundle. */
async function build(name: string, options: McpServerPluginOptions) {
  const outDir = path.join(tmp, name);
  await fs.cp(SITE, outDir, { recursive: true });
  warnings.length = 0;

  const context = {
    siteDir: tmp,
    siteConfig: { url: 'https://docs.example.com', baseUrl: '/', title: 'Example Docs' },
  } as unknown as LoadContext;
  const plugin = mcpServerPlugin(context, { skills: false, ...options }) as Plugin & {
    postBuild: (props: { outDir: string }) => Promise<void>;
  };
  await plugin.postBuild({ outDir } as never);

  const bundle = JSON.parse(await fs.readFile(path.join(outDir, 'mcp', 'bundle.json'), 'utf8'));
  return {
    docs: bundle.docs as Record<string, ProcessedDoc>,
    searchIndex: bundle.searchIndex,
    warnings: [...warnings].sort(),
  };
}

/** Documents sorted by route: directory order differs across file systems. */
function sortedDocs(docs: Record<string, ProcessedDoc>) {
  return Object.fromEntries(Object.entries(docs).sort(([a], [b]) => a.localeCompare(b)));
}

function rankings(docs: Record<string, ProcessedDoc>, searchIndex: unknown) {
  const index = loadLocalSearchIndex(searchIndex);
  return Object.fromEntries(
    QUERIES.map((query) => [
      query,
      searchLocalIndex(index, docs, query, { limit: 5 }).map((r) => ({
        route: r.route,
        score: Number(r.score.toFixed(4)),
        matchingHeadings: r.matchingHeadings,
      })),
    ])
  );
}

const golden = (value: unknown) => JSON.stringify(value, null, 2) + '\n';

describe.each<[string, McpServerPluginOptions]>([
  ['defaults', {}],
  [
    'custom-selectors',
    {
      contentSelectors: ['.theme-doc-markdown', 'article'],
      // Today only tag, .class, and [attr="v"] on plain attributes match;
      // the others are here to pin what they do.
      excludeSelectors: [
        'details',
        '.theme-admonition',
        '[role="tabpanel"]',
        'div.tabs-container',
        '[data-x="y"]',
        '.footnotes a',
        'table',
      ],
      minContentLength: 200,
      excludeRoutes: ['/404*', '/foo*'],
    },
  ],
])('extraction golden: %s', (name, options) => {
  let result: Awaited<ReturnType<typeof build>>;

  beforeAll(async () => {
    result = await build(name, options);
  });

  it('documents', async () => {
    await expect(golden(sortedDocs(result.docs))).toMatchFileSnapshot(
      path.join(EXPECTED, name, 'docs.json')
    );
  });

  it('search rankings', async () => {
    await expect(golden(rankings(result.docs, result.searchIndex))).toMatchFileSnapshot(
      path.join(EXPECTED, name, 'rankings.json')
    );
  });

  it('warnings', async () => {
    await expect(golden(result.warnings)).toMatchFileSnapshot(
      path.join(EXPECTED, name, 'warnings.json')
    );
  });
});
