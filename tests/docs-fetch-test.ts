import { describe, it, expect } from 'vitest';
import {
  formatNotFound,
  formatPageContent,
  formatSection,
  formatSkillFile,
} from '../src/mcp/tools/docs-fetch.js';
import type { ProcessedDoc, SkillFile } from '../src/types/index.js';

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

const SECTION_MD =
  '# Installation\n\nIntro.\n\n## Requirements\n\nNode 22.\n\n### Optional\n\nA linter.\n\n## Next\n\nDone.\n';
const at = (heading: string) => SECTION_MD.indexOf(heading);
const sectionDoc: ProcessedDoc = {
  route: '/docs/install',
  title: 'Installation',
  description: '',
  markdown: SECTION_MD,
  headings: [
    {
      level: 1,
      text: 'Installation',
      id: 'installation',
      startOffset: 0,
      endOffset: SECTION_MD.length,
    },
    {
      level: 2,
      text: 'Requirements',
      id: 'requirements',
      startOffset: at('## Requirements'),
      endOffset: at('## Next'),
    },
    {
      level: 3,
      text: 'Optional',
      id: 'optional',
      startOffset: at('### Optional'),
      endOffset: at('## Next'),
    },
    {
      level: 2,
      text: 'Next',
      id: 'next',
      startOffset: at('## Next'),
      endOffset: SECTION_MD.length,
    },
  ],
};

describe('formatSection', () => {
  it('returns the section and its subsections, up to the next same-level heading', () => {
    const text = formatSection('https://x.dev/docs/install', sectionDoc, 'requirements');
    expect(text).toBe(
      '# Installation: Requirements\n\n' +
        '> Section #requirements of https://x.dev/docs/install. Fetch the URL without #requirements for the whole page.\n\n' +
        '## Requirements\n\nNode 22.\n\n### Optional\n\nA linter.\n'
    );
  });

  it('falls back to the whole page, with a note, for an unknown fragment', () => {
    const text = formatSection('https://x.dev/docs/install', sectionDoc, 'nope');
    expect(
      text.startsWith(
        '> No section #nope on this page; showing the whole page.\n\n# Installation\n'
      )
    ).toBe(true);
    expect(text).toContain('## Next');
  });
});

describe('formatNotFound', () => {
  it('lists similar pages, then points to docs_search', () => {
    expect(
      formatNotFound({
        kind: 'not-found',
        tried: 'https://x.dev/docs/old/setup',
        similar: [
          { id: 'https://x.dev/docs/guides/setup', title: 'Setup' },
          { id: 'https://x.dev/docs/api/setup', title: '' },
        ],
      })
    ).toBe(
      'Page not found: https://x.dev/docs/old/setup\n' +
        'Pages with a similar path:\n' +
        '- https://x.dev/docs/guides/setup (Setup)\n' +
        '- https://x.dev/docs/api/setup\n' +
        'Or search with docs_search and fetch a URL from its results.'
    );
  });

  it('points to docs_search when nothing is similar', () => {
    expect(formatNotFound({ kind: 'not-found', tried: 'https://x.dev/nope', similar: [] })).toBe(
      'Page not found: https://x.dev/nope\nSearch with docs_search and fetch a URL from its results.'
    );
  });
});

describe('formatSkillFile', () => {
  it('returns a text file verbatim', () => {
    const file: SkillFile = {
      path: 'SKILL.md',
      mimeType: 'text/markdown',
      text: 'setup/SKILL.md',
      digest: 'sha256:x',
      size: 14,
    };
    expect(formatSkillFile('skill://setup/SKILL.md', file)).toBe('setup/SKILL.md');
  });

  it('points binary files at resources/read', () => {
    const text = formatSkillFile('skill://setup/logo.png', {
      path: 'logo.png',
      mimeType: 'image/png',
      blob: 'AA==',
      digest: 'sha256:x',
      size: 1,
    });
    expect(text).toContain('binary file (image/png, 1 bytes)');
    expect(text).toContain('resources/read');
  });

  it('says when the file is not found', () => {
    expect(formatSkillFile('skill://nope/SKILL.md', null)).toContain(
      'Skill file not found: skill://nope/SKILL.md'
    );
  });
});

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
