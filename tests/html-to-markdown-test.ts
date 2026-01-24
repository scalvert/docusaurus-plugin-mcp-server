import { describe, it, expect } from 'vitest';
import { htmlToMarkdown } from '../src/processing/html-to-markdown.js';

describe('htmlToMarkdown', () => {
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

  it('handles empty HTML', async () => {
    const html = '';
    const result = await htmlToMarkdown(html);

    expect(result).toBe('');
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
