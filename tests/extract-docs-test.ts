import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { extractDocs, extractPage, type PageOptions } from '../src/processing/extract-docs.js';
import { DEFAULT_PLUGIN_OPTIONS } from '../src/types/index.js';

const FILLER = 'Enough words here to count as real content for the extractor. '.repeat(2);

const page = (body: string, head = '<title>Page | Site</title>') =>
  `<!doctype html><html><head>${head}</head><body>${body}</body></html>`;

const options = (overrides: Partial<PageOptions> = {}): PageOptions => ({
  contentSelectors: ['article'],
  excludeSelectors: [],
  minContentLength: 10,
  ...overrides,
});

async function markdownOf(html: string, overrides: Partial<PageOptions> = {}) {
  const result = await extractPage(html, '/p', options(overrides));
  if (!('doc' in result)) throw new Error(`skipped: ${result.skipped}`);
  return result.doc.markdown;
}

describe('extractPage', () => {
  it('builds a document: h1 title, meta description, Markdown, headings', async () => {
    const result = await extractPage(
      page(
        `<article><h1>Intro</h1><p>${FILLER}</p><h2 id="next">Next</h2><p>More.</p></article>`,
        '<title>Ignored</title><meta name="description" content="About it">'
      ),
      '/docs/intro',
      options()
    );
    expect(result).toEqual({
      doc: {
        route: '/docs/intro',
        title: 'Intro',
        description: 'About it',
        markdown: `# Intro\n\n${FILLER.trim()}\n\n## Next\n\nMore.\n`,
        headings: [
          expect.objectContaining({ level: 1, text: 'Intro', id: 'intro', startOffset: 0 }),
          expect.objectContaining({ level: 2, text: 'Next', id: 'next' }),
        ],
      },
    });
  });

  it('falls back to <title>, og:description, and <body>', async () => {
    const result = await extractPage(
      page(
        `<div><p>${FILLER}</p></div>`,
        '<title>Fallback</title><meta property="og:description" content="OG">'
      ),
      '/x',
      options()
    );
    expect(result).toMatchObject({ doc: { title: 'Fallback', description: 'OG' } });
  });

  it('skips the first content selector when it has no real text', async () => {
    const md = await markdownOf(page(`<main><article>tiny</article><p>${FILLER}</p></main>`), {
      contentSelectors: ['article', 'main'],
    });
    expect(md).toContain('Enough words');
  });

  it('reports why a page was skipped', async () => {
    // The parser always supplies a <body>, so an empty page is too short.
    expect(await extractPage('<!doctype html><html></html>', '/x', options())).toEqual({
      skipped: 'too-short',
    });
    expect(
      await extractPage(
        page('<article><p>Short.</p></article>'),
        '/x',
        options({ minContentLength: 50 })
      )
    ).toEqual({ skipped: 'too-short' });
  });

  it("drops Docusaurus heading permalinks and keeps the headings' anchors", async () => {
    const result = await extractPage(
      page(
        `<article><p>${FILLER}</p>` +
          '<h2 class="anchor anchorWithStickyNavbar_x" id="setup">Setup<a href="#setup" class="hash-link" ' +
          'aria-label="Direct link to Setup" title="Direct link to Setup">\u200b</a></h2><p>One.</p>' +
          '<h2 class="anchor" id="setup-1">Setup<a href="#setup-1" class="hash-link">\u200b</a></h2><p>Two.</p>' +
          '<pre><code># Install it\n</code></pre></article>'
      ),
      '/p',
      options()
    );
    if (!('doc' in result)) throw new Error('skipped');
    const { markdown, headings } = result.doc;

    expect(markdown).not.toContain('Direct link');
    expect(markdown).toContain('\n## Setup\n');
    expect(headings.map(({ level, text, id }) => ({ level, text, id }))).toEqual([
      { level: 2, text: 'Setup', id: 'setup' },
      { level: 2, text: 'Setup', id: 'setup-1' },
    ]);
  });

  it('matches headings with images and joiners to their HTML ids, keeping the joiners', async () => {
    const family = '\u{1F468}\u200d\u{1F469}\u200d\u{1F467}';
    const result = await extractPage(
      page(
        `<article><p>${FILLER}</p>` +
          '<h2 id="logo"><img src="/i.png" alt="icon"> Logo</h2><p>One.</p>' +
          `<h2 id="family">Family ${family}</h2><p>Two.</p></article>`
      ),
      '/p',
      options()
    );
    if (!('doc' in result)) throw new Error('skipped');
    expect(result.doc.headings.map(({ text, id }) => ({ text, id }))).toEqual([
      { text: 'Logo', id: 'logo' },
      { text: `Family ${family}`, id: 'family' },
    ]);
  });

  it('always drops script, style, and noscript', async () => {
    const md = await markdownOf(
      page(
        `<article><p>${FILLER}</p><script>evil()</script><style>p{}</style><noscript>js</noscript></article>`
      )
    );
    expect(md).not.toMatch(/evil|p\{\}|js$/m);
  });
});

describe('excludeSelectors are full CSS', () => {
  const html = page(`
    <main class="layout">
      <article>
        <h1>Doc</h1>
        <p>${FILLER}</p>
        <div class="note keep">KEEP-PLAIN-DIV</div>
        <aside class="note">DROP-COMPOUND</aside>
        <section class="a"><p class="b">DROP-DESCENDANT</p><p>KEEP-SIBLING</p></section>
        <div data-noindex="true">DROP-DATA-ATTR</div>
        <span aria-hidden="true">DROP-ARIA</span>
        <nav id="toc">DROP-ID</nav>
        <p hidden>DROP-BOOLEAN-ATTR</p>
        <div class="toc">DROP-ANCESTOR-CONTEXT</div>
      </article>
    </main>`);

  it.each([
    ['aside.note', 'DROP-COMPOUND'],
    ['.a .b', 'DROP-DESCENDANT'],
    ['[data-noindex="true"]', 'DROP-DATA-ATTR'],
    ['[aria-hidden="true"]', 'DROP-ARIA'],
    ['#toc', 'DROP-ID'],
    ['[hidden]', 'DROP-BOOLEAN-ATTR'],
    // Matched against the whole page: the ancestor is outside the content element.
    ['main.layout .toc', 'DROP-ANCESTOR-CONTEXT'],
  ])('%s', async (selector, dropped) => {
    const md = await markdownOf(html, { excludeSelectors: [selector] });
    expect(md).not.toContain(dropped);
    expect(md).toContain('KEEP-PLAIN-DIV');
    expect(md).toContain('KEEP-SIBLING');
  });

  it('does not let two broken selectors join into a valid one', async () => {
    const reported: string[] = [];
    const result = await extractPage(
      page(`<article><p>${FILLER}</p><p title="a, b">KEEP</p></article>`),
      '/p',
      options({ excludeSelectors: ['[title="a', 'b"]'] }),
      (_option, selector) => reported.push(selector)
    );
    expect(result).toMatchObject({ doc: { markdown: expect.stringContaining('KEEP') } });
    expect(reported).toEqual(['[title="a', 'b"]']);
  });

  it('keeps matching the 2.1 forms: tag, .class, [attr="v"]', async () => {
    const md = await markdownOf(
      page(
        `<article><p>${FILLER}</p><nav>N</nav><div class="x">X</div><div role="note">R</div></article>`
      ),
      { excludeSelectors: ['nav', '.x', '[role="note"]'] }
    );
    expect(md.trim()).toBe(FILLER.trim());
  });

  it('never removes the content element itself', async () => {
    const md = await markdownOf(page(`<article><p>${FILLER}</p></article>`), {
      excludeSelectors: ['article'],
    });
    expect(md).toContain('Enough words');
  });

  it('removes matches inside the content only, not elsewhere on the page', async () => {
    const result = await extractPage(
      page(`<header><h1>Site</h1></header><article><h1>Doc</h1><p>${FILLER}</p></article>`),
      '/p',
      options({ excludeSelectors: ['h1'] })
    );
    // The title still comes from the whole page.
    expect(result).toMatchObject({ doc: { title: 'Site' } });
  });

  it('matches the defaults the same way as 2.1', async () => {
    const md = await markdownOf(
      page(
        `<article><header>H</header><p>${FILLER}</p><nav>N</nav><footer>F</footer><aside>A</aside>` +
          `<div role="navigation">RN</div><div role="banner">RB</div><div role="contentinfo">RC</div></article>`
      ),
      { excludeSelectors: DEFAULT_PLUGIN_OPTIONS.excludeSelectors }
    );
    expect(md.trim()).toBe(FILLER.trim());
  });
});

describe('extractDocs', () => {
  let dir: string;
  let warn: { mock: { calls: unknown[][] } };

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'mcp-extract-'));
    vi.spyOn(console, 'log').mockImplementation(() => {});
    warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await fs.mkdir(path.join(dir, 'a'), { recursive: true });
    await fs.writeFile(
      path.join(dir, 'a', 'index.html'),
      page(`<article><h1>A</h1><p>${FILLER} <a href="/b">B</a></p><nav>NAV</nav></article>`)
    );
    await fs.writeFile(
      path.join(dir, 'b.html'),
      page(`<article><h1>B</h1><p>${FILLER}</p></article>`)
    );
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await fs.rm(dir, { recursive: true, force: true });
  });

  it('warns once per invalid selector and keeps the valid ones', async () => {
    const { docs, pageCount } = await extractDocs(dir, {
      contentSelectors: ['article:nope(', 'article'],
      excludeSelectors: ['::before', 'a:hover', 'nav'],
      excludeRoutes: [],
      minContentLength: 10,
    });

    expect(pageCount).toBe(2);
    expect(docs.map((d) => d.route).sort()).toEqual(['/a', '/b']);
    expect(docs.find((d) => d.route === '/a')?.markdown).not.toContain('NAV');

    const messages = warn.mock.calls.map((call) => String(call[0]));
    expect(
      messages.filter((m) => m.includes('contentSelectors entry "article:nope("'))
    ).toHaveLength(1);
    expect(messages.filter((m) => m.includes('excludeSelectors entry "::before"'))).toHaveLength(1);
    // Fails only on pages with an <a>: still reported once.
    expect(messages.filter((m) => m.includes('excludeSelectors entry "a:hover"'))).toHaveLength(1);
  });

  it('logs and skips pages, without failing', async () => {
    const { docs } = await extractDocs(dir, {
      ...DEFAULT_PLUGIN_OPTIONS,
      excludeRoutes: ['/b'],
      minContentLength: 10_000,
    });
    expect(docs).toEqual([]);
    expect(warn.mock.calls.map((call) => String(call[0]))).toEqual([
      `[MCP] Insufficient content in ${path.join(dir, 'a', 'index.html')}`,
    ]);
  });
});
