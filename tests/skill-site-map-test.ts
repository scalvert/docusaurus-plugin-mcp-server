import { describe, it, expect } from 'vitest';
import { renderSiteMap, type SiteMapDoc } from '../src/skills/site-map.js';
import { documentId } from '../src/artifacts/bundle.js';

const SITE = 'https://acme.dev/';
const doc = (route: string, title = route.split('/').pop() || 'Home'): SiteMapDoc => ({
  route,
  title,
});
const lines = (map: string) => map.split('\n').filter((l) => l.startsWith('- '));
const paths = (map: string) => lines(map).map((l) => l.split(/[ :]/)[1]);

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
    expect(map.startsWith("## Where things are\n\nThe site's pages, grouped by URL path")).toBe(
      true
    );
    expect(paths(map)).toEqual(['`/api`', '`/guides`', '`/about`', '`/blog`']);
    expect(lines(map)[2]).toBe('- `/about`: [about](<https://acme.dev/about>)');
    expect(lines(map)[3]).toBe('- `/blog`: Includes post.');
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
      '- `/guides` (2 pages): [Guides](<https://acme.dev/docs/guides>). Includes Setup.'
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
        ...['a', 'b', 'c', 'd'].map((p) => doc(`/other/${p}`)),
        ...['a', 'b', 'c'].map((p) => doc(`/more/${p}`)),
      ],
      SITE
    );
    expect(lines(map)[0]).toBe(
      '- `/api` (7 pages): [APIs](<https://acme.dev/api>). Includes Client API; Indexing API; Platform API.'
    );
  });

  it('takes examples from different subsections before repeating one', () => {
    const map = renderSiteMap(
      [
        doc('/api/activity/a', 'Activity A'),
        doc('/api/activity/b', 'Activity B'),
        doc('/api/agents/create', 'Create an agent'),
        doc('/api/chat/send', 'Send a message'),
        ...['a', 'b', 'c', 'd'].map((p) => doc(`/other/${p}`)),
      ],
      SITE
    );
    expect(lines(map)[0]).toBe(
      '- `/api` (4 pages): Includes Activity A; Create an agent; Send a message.'
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
    expect(paths(map)).toEqual(['`/docs/guides`', '`/docs/api`']);
  });

  it('splits a section holding most of the pages, as on a /docs + /blog site', () => {
    const map = renderSiteMap(
      [
        doc('/'),
        ...['a', 'b', 'c'].map((p) => doc(`/docs/guides/${p}`)),
        ...['x', 'y'].map((p) => doc(`/docs/api/${p}`)),
        doc('/docs/intro'),
        ...['p1', 'p2', 'p3'].map((p) => doc(`/blog/${p}`)),
      ],
      SITE
    );
    expect(paths(map)).toEqual(['`/blog`', '`/docs/guides`', '`/docs/api`', '`/docs/intro`']);
  });

  it('does not split a large section into single pages', () => {
    const map = renderSiteMap(
      [
        ...['a', 'b', 'c', 'd'].map((p) => doc(`/guides/${p}`)),
        ...['x', 'y'].map((p) => doc(`/api/${p}`)),
      ],
      SITE
    );
    expect(paths(map)).toEqual(['`/guides`', '`/api`']);
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

  it('escapes titles that would break the markdown', () => {
    const map = renderSiteMap(
      [doc('/a', 'See [this](x) <!-- hi -->'), doc('/a/b', 'Arrays[]'), doc('/c/x'), doc('/c/y')],
      SITE
    );
    expect(lines(map)[0]).toBe(
      '- `/a` (2 pages): [See \\[this\\](x) \\<!-- hi --\\>](<https://acme.dev/a>). Includes Arrays\\[\\].'
    );
  });

  it('orders ties the same way whatever the locale', () => {
    // localeCompare would put "a" before "B"; plain comparison puts "B" first.
    const map = renderSiteMap([doc('/a/1'), doc('/a/2'), doc('/B/1'), doc('/B/2')], SITE);
    expect(paths(map)).toEqual(['`/B`', '`/a`']);
  });
});
