import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs/promises';
import { discoverPages } from '../src/processing/pages.js';

let tmpDir: string;

async function write(rel: string, contents = '<html></html>') {
  const full = path.join(tmpDir, rel);
  await fs.mkdir(path.dirname(full), { recursive: true });
  await fs.writeFile(full, contents);
  return full;
}

const routes = async (excludeRoutes: string[] = []) =>
  (await discoverPages(tmpDir, excludeRoutes)).map((page) => page.route).sort();

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'pages-'));
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe('discoverPages', () => {
  it('discovers index.html-style routes (trailingSlash: true)', async () => {
    await write('index.html');
    await write('guides/getting-started/index.html');
    await write('api/index.html');

    expect(await routes()).toEqual(['/', '/api', '/guides/getting-started']);
  });

  it('discovers sibling-html routes (trailingSlash: false)', async () => {
    await write('index.html');
    await write('guides/getting-started.html');
    await write('api.html');

    expect(await routes()).toEqual(['/', '/api', '/guides/getting-started']);
  });

  it('discovers mixed output (both forms in the same build), once per route', async () => {
    await write('docs/intro.html');
    await write('docs/intro/index.html');
    await write('blog.html');
    await write('index.html');

    expect(await routes()).toEqual(['/', '/blog', '/docs/intro']);
  });

  it('skips 404.html and asset directories', async () => {
    await write('404.html');
    await write('assets/foo.html');
    await write('img/bar.html');
    await write('static/baz.html');
    await write('real-page.html');

    expect(await routes()).toEqual(['/real-page']);
  });

  it('prefers index.html over sibling .html on collision', async () => {
    const sibling = await write('docs/intro.html', '<html><body>sibling</body></html>');
    const indexed = await write('docs/intro/index.html', '<html><body>indexed</body></html>');

    const intro = (await discoverPages(tmpDir, [])).find((page) => page.route === '/docs/intro');
    expect(intro?.htmlPath).toBe(indexed);
    expect(intro?.htmlPath).not.toBe(sibling);
  });

  it('applies excludeRoutes globs', async () => {
    await write('public.html');
    await write('search.html');
    await write('search/results.html');
    await write('a1.html');
    await write('a22.html');

    expect(await routes(['/search*', '/a?'])).toEqual(['/a22', '/public']);
  });
});
