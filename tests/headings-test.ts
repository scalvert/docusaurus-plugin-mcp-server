import { describe, it, expect } from 'vitest';
import { unified } from 'unified';
import rehypeParse from 'rehype-parse';
import type { Element } from 'hast';
import { extractHeadings, htmlHeadings } from '../src/processing/headings.js';
import type { DocHeading } from '../src/types/index.js';

/** A section by heading ID, sliced by the heading offsets (what custom indexers may do). */
function extractSection(markdown: string, id: string, headings: DocHeading[]): string | null {
  const heading = headings.find((h) => h.id === id);
  return heading ? markdown.slice(heading.startOffset, heading.endOffset).trim() : null;
}

function element(html: string): Element {
  const root = unified().use(rehypeParse, { fragment: true }).parse(`<article>${html}</article>`);
  return root.children[0] as Element;
}

describe('extractHeadings', () => {
  it('reads levels, plain text, and offsets from the Markdown', () => {
    const markdown =
      '# Title\n\nIntro.\n\n## **Bold** and `code` and [link](/x)\n\nBody.\n\n### Sub\n';
    const headings = extractHeadings(markdown);

    expect(headings.map(({ level, text }) => ({ level, text }))).toEqual([
      { level: 1, text: 'Title' },
      { level: 2, text: 'Bold and code and link' },
      { level: 3, text: 'Sub' },
    ]);
    for (const h of headings) {
      expect(markdown.slice(h.startOffset)).toMatch(/^#{1,6} /);
    }
  });

  it('does not treat # lines inside code blocks as headings', () => {
    const markdown =
      '## Install\n\n```bash\n# Install it\n## not a heading\n```\n\n~~~\n# nor this\n~~~\n';
    expect(extractHeadings(markdown).map((h) => h.text)).toEqual(['Install']);
  });

  it('takes ids from the HTML headings, matched by level and text in order', () => {
    const html = htmlHeadings(
      element(
        '<h2 id="setup">Setup</h2><h3 id="prerequisites">Prerequisites</h3>' +
          '<h2 id="setup-1">Setup</h2><h2 id="my-custom-id">Custom</h2>'
      )
    );
    const markdown =
      '## Setup\n\nA.\n\n### Prerequisites\n\nB.\n\n## Setup\n\nC.\n\n## Custom\n\nD.\n';

    expect(extractHeadings(markdown, html).map((h) => h.id)).toEqual([
      'setup',
      'prerequisites',
      'setup-1',
      'my-custom-id',
    ]);
  });

  it('matches HTML headings ignoring zero-width characters, and keeps them in the text', () => {
    const headings = extractHeadings('## a\u200db\n', [{ level: 2, text: 'ab', id: 'x' }]);
    expect(headings[0]).toMatchObject({ text: 'a\u200db', id: 'x' });
  });

  it('names a heading that is only an image by its alt text, and still matches its id', () => {
    const markdown = '## ![Logo](/logo.png)\n\n## ![Mark](/mark.png)\n';
    const headings = extractHeadings(markdown, [{ level: 2, text: '', id: 'brand' }]);
    expect(headings.map(({ text, id }) => ({ text, id }))).toEqual([
      { text: 'Logo', id: 'brand' },
      { text: 'Mark', id: 'mark' },
    ]);
  });

  it('generates an id when no HTML heading matches', () => {
    const headings = extractHeadings('## Getting Started!\n', [
      { level: 3, text: 'Getting Started!', id: 'x' },
    ]);
    expect(headings[0]?.id).toBe('getting-started');
  });

  it('handles Markdown without headings', () => {
    expect(extractHeadings('')).toEqual([]);
    expect(extractHeadings('Just a paragraph.\n')).toEqual([]);
  });
});

describe('htmlHeadings', () => {
  it('lists h1-h6 in document order with ids and reader-visible text', () => {
    expect(
      htmlHeadings(
        element(
          '<h1>Doc</h1><section><h2 id="a">Alpha\u200b</h2><div><h4>Deep   one</h4></div></section>'
        )
      )
    ).toEqual([
      { level: 1, text: 'Doc' },
      { level: 2, text: 'Alpha', id: 'a' },
      { level: 4, text: 'Deep one' },
    ]);
  });
});

describe('heading offsets delimit sections', () => {
  const markdown = `# Main Title

Introduction paragraph.

## First Section

First section content.

### Subsection

Subsection content.

## Second Section

Second section content.

## Third Section

Third section content.
`;
  const headings = extractHeadings(markdown);

  it('a section runs to the next heading at the same or a higher level', () => {
    expect(extractSection(markdown, 'first-section', headings)).toBe(
      '## First Section\n\nFirst section content.\n\n### Subsection\n\nSubsection content.'
    );
    expect(extractSection(markdown, 'subsection', headings)).toBe(
      '### Subsection\n\nSubsection content.'
    );
    expect(extractSection(markdown, 'second-section', headings)).toBe(
      '## Second Section\n\nSecond section content.'
    );
  });

  it('the last section runs to the end', () => {
    expect(extractSection(markdown, 'third-section', headings)).toBe(
      '## Third Section\n\nThird section content.'
    );
    expect(headings.at(-1)?.endOffset).toBe(markdown.length);
  });

  it('returns null for a missing id', () => {
    expect(extractSection(markdown, 'nope', headings)).toBeNull();
  });
});
