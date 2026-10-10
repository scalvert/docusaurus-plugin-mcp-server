import { describe, it, expect } from 'vitest';
import { unified } from 'unified';
import rehypeParse from 'rehype-parse';
import type { Element } from 'hast';
import { hastToMarkdown } from '../src/processing/markdown.js';

/** Markdown for an HTML fragment, as the content element of a page. */
function htmlToMarkdown(html: string): Promise<string> {
  const fragment = unified().use(rehypeParse, { fragment: true }).parse(html);
  const element: Element = {
    type: 'element',
    tagName: 'article',
    properties: {},
    children: fragment.children as Element['children'],
  };
  return hastToMarkdown(element);
}

describe('hastToMarkdown', () => {
  it('converts basic HTML to markdown', async () => {
    const html = '<h1>Hello World</h1><p>This is a paragraph.</p>';
    const result = await htmlToMarkdown(html);

    expect(result).toContain('# Hello World');
    expect(result).toContain('This is a paragraph.');
  });

  it('converts links correctly', async () => {
    const html = '<p>Visit <a href="https://example.com">Example</a> for more info.</p>';
    const result = await htmlToMarkdown(html);

    expect(result).toContain('[Example](https://example.com)');
  });

  it('converts code blocks', async () => {
    const html = '<pre><code class="language-javascript">const x = 1;</code></pre>';
    const result = await htmlToMarkdown(html);

    expect(result).toContain('const x = 1;');
  });

  it('converts inline code', async () => {
    const html = '<p>Use the <code>npm install</code> command.</p>';
    const result = await htmlToMarkdown(html);

    expect(result).toContain('`npm install`');
  });

  it('converts lists', async () => {
    const html = '<ul><li>Item 1</li><li>Item 2</li></ul>';
    const result = await htmlToMarkdown(html);

    // remark-stringify uses - for list items by default
    expect(result).toContain('- Item 1');
    expect(result).toContain('- Item 2');
  });

  it('converts ordered lists', async () => {
    const html = '<ol><li>First</li><li>Second</li></ol>';
    const result = await htmlToMarkdown(html);

    expect(result).toContain('1. First');
    expect(result).toContain('2. Second');
  });

  it('handles an empty element', async () => {
    expect((await htmlToMarkdown('')).trim()).toBe('');
  });

  it('converts nested headings', async () => {
    const html = '<h1>Title</h1><h2>Subtitle</h2><h3>Section</h3>';
    const result = await htmlToMarkdown(html);

    expect(result).toContain('# Title');
    expect(result).toContain('## Subtitle');
    expect(result).toContain('### Section');
  });

  it('converts bold and italic text', async () => {
    const html = '<p><strong>Bold</strong> and <em>italic</em> text.</p>';
    const result = await htmlToMarkdown(html);

    expect(result).toContain('**Bold**');
    expect(result).toContain('*italic*');
  });

  it('converts blockquotes', async () => {
    const html = '<blockquote>This is a quote.</blockquote>';
    const result = await htmlToMarkdown(html);

    expect(result).toContain('> This is a quote.');
  });
});

describe('Docusaurus code blocks', () => {
  const prism = (lineTag: string) =>
    '<div class="language-bash codeBlockContainer_x"><div class="codeBlockContent_x">' +
    '<pre tabindex="0" class="prism-code language-bash codeBlock_x"><code class="codeBlockLines_x">' +
    `<${lineTag} class="token-line"><span class="token function">npm</span><span class="token plain"> install</span><br></${lineTag}>` +
    `<${lineTag} class="token-line"><span class="token plain">npm run build</span><br></${lineTag}>` +
    '</code></pre></div></div>';

  it.each([
    ['span lines (before Docusaurus 3.8)', 'span'],
    ['div lines (Docusaurus 3.8 and later)', 'div'],
  ])('keeps one line per line and the language, with %s', async (_label, lineTag) => {
    expect(await htmlToMarkdown(prism(lineTag))).toBe('```bash\nnpm install\nnpm run build\n```\n');
  });

  it('takes the language from a plain <pre>, and leaves a <pre> without one alone', async () => {
    expect(await htmlToMarkdown('<pre class="language-json"><code>{}</code></pre>')).toBe(
      '```json\n{}\n```\n'
    );
    expect(await htmlToMarkdown('<pre><code>a\nb</code></pre>')).toBe('```\na\nb\n```\n');
  });
});
