import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import path from 'path';
import os from 'os';
import fs from 'fs-extra';
import { collectRoutes, discoverHtmlFiles } from '../src/plugin/route-collector.js';

let tmpDir: string;

async function write(rel: string, contents = '<html></html>') {
  const full = path.join(tmpDir, rel);
  await fs.ensureDir(path.dirname(full));
  await fs.writeFile(full, contents);
  return full;
}

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'route-collector-'));
});

afterEach(async () => {
  await fs.remove(tmpDir);
});

describe('discoverHtmlFiles', () => {
  it('discovers index.html-style routes (trailingSlash: true)', async () => {
    await write('index.html');
    await write('guides/getting-started/index.html');
    await write('api/index.html');

    const routes = await discoverHtmlFiles(tmpDir);
    const paths = routes.map((r) => r.path).sort();

    expect(paths).toEqual(['/', '/api', '/guides/getting-started']);
  });

  it('discovers sibling-html routes (trailingSlash: false)', async () => {
    await write('index.html');
    await write('guides/getting-started.html');
    await write('api.html');

    const routes = await discoverHtmlFiles(tmpDir);
    const paths = routes.map((r) => r.path).sort();

    expect(paths).toEqual(['/', '/api', '/guides/getting-started']);
  });

  it('discovers mixed output (both forms in the same build)', async () => {
    await write('docs/intro.html');
    await write('docs/intro/index.html');
    await write('blog.html');
    await write('index.html');

    const routes = await discoverHtmlFiles(tmpDir);
    const paths = routes.map((r) => r.path).sort();

    expect(paths).toEqual(['/', '/blog', '/docs/intro', '/docs/intro']);
  });

  it('skips 404.html and asset directories', async () => {
    await write('404.html');
    await write('assets/foo.html');
    await write('img/bar.html');
    await write('static/baz.html');
    await write('real-page.html');

    const routes = await discoverHtmlFiles(tmpDir);
    const paths = routes.map((r) => r.path);

    expect(paths).toEqual(['/real-page']);
  });
});

describe('collectRoutes', () => {
  it('prefers index.html over sibling .html on collision', async () => {
    const sibling = await write('docs/intro.html', '<html><body>sibling</body></html>');
    const indexed = await write('docs/intro/index.html', '<html><body>indexed</body></html>');

    const routes = await collectRoutes(tmpDir, []);
    const intro = routes.find((r) => r.path === '/docs/intro');

    expect(intro?.htmlPath).toBe(indexed);
    expect(intro?.htmlPath).not.toBe(sibling);
  });

  it('applies excludePatterns', async () => {
    await write('public.html');
    await write('search.html');
    await write('search/results.html');

    const routes = await collectRoutes(tmpDir, ['/search*']);
    const paths = routes.map((r) => r.path).sort();

    expect(paths).toEqual(['/public']);
  });
});
