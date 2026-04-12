import { describe, it, expect } from 'vitest';
import { formatPageContent } from '../src/mcp/tools/docs-fetch.js';
import type { ProcessedDoc } from '../src/types/index.js';

const sampleDoc: ProcessedDoc = {
  route: '/docs/test',
  title: 'Test Page',
  description: 'A test page',
  markdown: '# Test\n\nSome content here.',
  headings: [
    { level: 1, text: 'Test', id: 'test', startOffset: 0, endOffset: 10 },
    { level: 2, text: 'Section', id: 'section', startOffset: 11, endOffset: 30 },
  ],
};

describe('formatPageContent', () => {
  it('returns "Page not found" for null doc', () => {
    const result = formatPageContent(null);
    expect(result).toContain('Page not found');
  });

  it('includes title, description, TOC, and markdown for a full doc', () => {
    const result = formatPageContent(sampleDoc);

    expect(result).toContain('# Test Page');
    expect(result).toContain('> A test page');
    expect(result).toContain('## Contents');
    expect(result).toContain('- [Test](#test)');
    expect(result).toContain('- [Section](#section)');
    expect(result).toContain('Some content here.');
  });

  it('omits description blockquote when description is empty', () => {
    const doc: ProcessedDoc = {
      ...sampleDoc,
      description: '',
    };
    const result = formatPageContent(doc);

    expect(result).not.toContain('> ');
    expect(result).toContain('# Test Page');
  });

  it('omits Contents section when there are no headings', () => {
    const doc: ProcessedDoc = {
      ...sampleDoc,
      headings: [],
    };
    const result = formatPageContent(doc);

    expect(result).not.toContain('## Contents');
    expect(result).not.toContain('---');
    expect(result).toContain('# Test Page');
    expect(result).toContain('Some content here.');
  });

  it('excludes headings deeper than level 3 from TOC', () => {
    const doc: ProcessedDoc = {
      ...sampleDoc,
      headings: [
        { level: 1, text: 'Top', id: 'top', startOffset: 0, endOffset: 5 },
        { level: 2, text: 'Sub', id: 'sub', startOffset: 6, endOffset: 12 },
        { level: 3, text: 'SubSub', id: 'subsub', startOffset: 13, endOffset: 20 },
        { level: 4, text: 'Deep', id: 'deep', startOffset: 21, endOffset: 28 },
        { level: 5, text: 'Deeper', id: 'deeper', startOffset: 29, endOffset: 36 },
      ],
    };
    const result = formatPageContent(doc);

    expect(result).toContain('- [Top](#top)');
    expect(result).toContain('- [Sub](#sub)');
    expect(result).toContain('- [SubSub](#subsub)');
    expect(result).not.toContain('Deep');
    expect(result).not.toContain('Deeper');
  });

  it('indents TOC entries by heading level', () => {
    const doc: ProcessedDoc = {
      ...sampleDoc,
      headings: [
        { level: 1, text: 'H1', id: 'h1', startOffset: 0, endOffset: 5 },
        { level: 2, text: 'H2', id: 'h2', startOffset: 6, endOffset: 12 },
        { level: 3, text: 'H3', id: 'h3', startOffset: 13, endOffset: 20 },
      ],
    };
    const result = formatPageContent(doc);
    const lines = result.split('\n');

    const h1Line = lines.find((l) => l.includes('[H1]'));
    const h2Line = lines.find((l) => l.includes('[H2]'));
    const h3Line = lines.find((l) => l.includes('[H3]'));

    // level 1: no indent (0 repeats of '  ')
    expect(h1Line).toBe('- [H1](#h1)');
    // level 2: 2-space indent
    expect(h2Line).toBe('  - [H2](#h2)');
    // level 3: 4-space indent
    expect(h3Line).toBe('    - [H3](#h3)');
  });
});
