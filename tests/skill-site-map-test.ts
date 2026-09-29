import { describe, it, expect } from 'vitest';
import { renderSiteMap, type SiteMapDoc } from '../src/skills/site-map.js';
import { documentId } from '../src/search/local-search.js';

const SITE = 'https://acme.dev/';
const doc = (route: string, title = route.split('/').pop() || 'Home'): SiteMapDoc => ({
  route,
  title,
});
const lines = (map: string) => map.split('\n').filter((l) => l.startsWith('- '));

describe('renderSiteMap', () => {
  it('groups pages by top-level path, largest first, then by path', () => {
    const map = renderSiteMap(
      [
        doc('/'),
        doc('/guides/a'),
        doc('/guides/b'),
        doc('/api/x'),
        doc('/api/y'),
        doc('/api/z'),
        doc('/blog/post'),
        doc('/about'),
      ],
      SITE
    );
    expect(map.startsWith('## Where things are\n\nThe 8 indexed pages')).toBe(true);
    expect(lines(map).map((l) => l.split(' ')[1])).toEqual([
      '`/api`',
      '`/guides`',
      '`/about`',
      '`/blog`',
    ]);
  });

  it('links a section overview with the URL docs_fetch expects, including a base path', () => {
    const site = 'https://acme.dev/docs/';
    const overview = doc('/guides', 'Guides');
    const map = renderSiteMap(
      [overview, doc('/guides/setup', 'Setup'), doc('/api/x'), doc('/api/y')],
      site
    );
    expect(documentId(overview, site)).toBe('https://acme.dev/docs/guides');
    expect(map).toContain(
      '- `/guides` (2 pages): [Guides](https://acme.dev/docs/guides). Includes Setup.'
    );
  });

  it('lists up to three examples, shallowest first, without repeating titles', () => {
    const map = renderSiteMap(
      [
        doc('/api', 'APIs'),
        doc('/api/client/deep/one', 'Deep'),
        doc('/api/client', 'Client API'),
        doc('/api/indexing', 'Indexing API'),
        doc('/api/indexing/again', 'client api'),
        doc('/api/admin', 'APIs'),
        doc('/api/platform', 'Platform API'),
        doc('/other/x'),
        doc('/other/y'),
      ],
      SITE
    );
    expect(lines(map)[0]).toBe(
      '- `/api` (7 pages): [APIs](https://acme.dev/api). Includes Client API; Indexing API; Platform API.'
    );
  });

  it('groups one level down when every page shares a prefix', () => {
    const map = renderSiteMap(
      [
        doc('/docs'),
        doc('/docs/guides/a'),
        doc('/docs/guides/b'),
        doc('/docs/guides/c'),
        doc('/docs/api/x'),
        doc('/docs/api/y'),
      ],
      SITE
    );
    expect(lines(map).map((l) => l.split(' ')[1])).toEqual(['`/docs/guides`', '`/docs/api`']);
  });

  it('renders nothing unless at least two sections have several pages', () => {
    expect(renderSiteMap([], SITE)).toBe('');
    // A flat site: every "section" would be a single page
    expect(renderSiteMap([doc('/a'), doc('/b'), doc('/c')], SITE)).toBe('');
    expect(renderSiteMap([doc('/docs/a'), doc('/docs/b'), doc('/docs/c')], SITE)).toBe('');
    // One real section plus stray pages
    expect(renderSiteMap([doc('/guides/a'), doc('/guides/b'), doc('/about')], SITE)).toBe('');
  });

  it('summarizes sections beyond the first twelve', () => {
    const docs = Array.from({ length: 15 }, (_, i) => [
      doc(`/s${String(i).padStart(2, '0')}/one`),
      doc(`/s${String(i).padStart(2, '0')}/two`),
    ]).flat();
    const map = renderSiteMap(docs, SITE);
    expect(lines(map)).toHaveLength(13);
    expect(lines(map)[12]).toBe('- …and 6 pages in 3 smaller sections.');
  });

  it('cleans up page titles and skips untitled pages', () => {
    const long = 'x'.repeat(120);
    const map = renderSiteMap(
      [
        doc('/a/one', '  Two\n  lines '),
        doc('/a/two', long),
        doc('/a/three', '   '),
        doc('/b/x'),
        doc('/b/y'),
      ],
      SITE
    );
    expect(lines(map)[0]).toBe(`- \`/a\` (2 pages): Includes Two lines; ${'x'.repeat(79)}….`);
  });
});
