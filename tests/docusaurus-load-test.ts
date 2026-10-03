/**
 * Loads the built plugin the way Docusaurus does (`loadFreshModule`: jiti
 * with `interopDefault`), then runs a build with it over the fixture site.
 *
 * Vitest imports the package as native ESM, which hides interop failures
 * like zod >= 4.6 (frozen CommonJS exports): `import { z } from 'zod'` loaded
 * through jiti gave `z === undefined`, and every `docusaurus build` failed
 * with "Docusaurus could not load module". Needs `dist/` (npm run build).
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { loadFreshModule } from '@docusaurus/utils';
import type { LoadContext, Plugin } from '@docusaurus/types';

const DIST = path.join(import.meta.dirname, '..', 'dist', 'index.js');
const SITE = path.join(import.meta.dirname, 'fixtures', 'extract', 'site');

let tmp: string;

beforeAll(async () => {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'mcp-docusaurus-load-'));
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterAll(async () => {
  vi.restoreAllMocks();
  await fs.rm(tmp, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
});

// jiti transpiles the whole bundle on a cold cache: about 1s locally, up to
// ~5s on CI's Windows and coverage runners.
const LOAD_TIMEOUT = 60_000;

describe('the built plugin under Docusaurus', () => {
  it(
    'loads through loadFreshModule and builds the artifact bundle',
    async () => {
      const plugin = (await loadFreshModule(DIST)) as (
        context: LoadContext,
        options: object
      ) => Plugin & { postBuild: (props: { outDir: string }) => Promise<void> };
      expect(typeof plugin).toBe('function');

      const outDir = path.join(tmp, 'build');
      await fs.cp(SITE, outDir, { recursive: true });
      const context = {
        siteDir: tmp,
        siteConfig: { url: 'https://docs.example.com', baseUrl: '/', title: 'Example Docs' },
      } as unknown as LoadContext;

      await plugin(context, {}).postBuild({ outDir } as never);

      const bundle = JSON.parse(await fs.readFile(path.join(outDir, 'mcp', 'bundle.json'), 'utf8'));
      expect(bundle.formatVersion).toBe(1);
      expect(Object.keys(bundle.docs).length).toBeGreaterThan(5);
      // Skills use zod schemas too (the built-in skill is on by default).
      expect(
        bundle.skills.skills.map((s: { frontmatter: { name: string } }) => s.frontmatter.name)
      ).toEqual(['docs-research']);
    },
    LOAD_TIMEOUT
  );
});
