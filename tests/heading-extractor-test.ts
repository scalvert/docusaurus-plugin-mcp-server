import { describe, it, expect } from 'vitest';
import {
  extractHeadingsFromMarkdown,
  extractSection,
} from '../src/processing/heading-extractor.js';

describe('extractHeadingsFromMarkdown', () => {
  it('extracts headings with IDs', () => {
    const markdown = `# Title {#title}

Some content here.

## Section One {#section-one}

Content for section one.

### Subsection {#subsection}

More content.

## Section Two {#section-two}

Final content.`;

    const headings = extractHeadingsFromMarkdown(markdown);

    expect(headings).toHaveLength(4);
    expect(headings[0]).toMatchObject({
      level: 1,
      text: 'Title',
      id: 'title',
    });
    expect(headings[1]).toMatchObject({
      level: 2,
      text: 'Section One',
      id: 'section-one',
    });
    expect(headings[2]).toMatchObject({
      level: 3,
      text: 'Subsection',
      id: 'subsection',
    });
    expect(headings[3]).toMatchObject({
      level: 2,
      text: 'Section Two',
      id: 'section-two',
    });
  });

  it('generates IDs for headings without explicit IDs', () => {
    const markdown = `# Hello World

## Getting Started

### Installation`;

    const headings = extractHeadingsFromMarkdown(markdown);

    expect(headings).toHaveLength(3);
    expect(headings[0]?.id).toBe('hello-world');
    expect(headings[1]?.id).toBe('getting-started');
    expect(headings[2]?.id).toBe('installation');
  });

  it('handles empty markdown', () => {
    const headings = extractHeadingsFromMarkdown('');
    expect(headings).toHaveLength(0);
  });

  it('handles markdown with no headings', () => {
    const markdown = 'Just some text without any headings.';
    const headings = extractHeadingsFromMarkdown(markdown);
    expect(headings).toHaveLength(0);
  });

  it('calculates correct offsets', () => {
    const markdown = `# Title

Content.

## Next Section

More content.`;

    const headings = extractHeadingsFromMarkdown(markdown);

    expect(headings).toHaveLength(2);
    // First heading should start at 0
    expect(headings[0]?.startOffset).toBe(0);
    // Second heading should start where its line begins
    expect(headings[1]?.startOffset).toBeGreaterThan(0);
    // Both headings should have defined offsets
    expect(headings[0]?.endOffset).toBeDefined();
    expect(headings[1]?.endOffset).toBeDefined();
  });
});

describe('extractSection', () => {
  const markdown = `# Main Title {#main-title}

Introduction paragraph.

## First Section {#first-section}

Content of the first section.

More content in first section.

## Second Section {#second-section}

Content of the second section.

### Subsection {#subsection}

Subsection content.

## Third Section {#third-section}

Final content.`;

  const headings = extractHeadingsFromMarkdown(markdown);

  it('extracts a section by heading ID', () => {
    const section = extractSection(markdown, 'first-section', headings);

    expect(section).not.toBeNull();
    expect(section).toContain('## First Section');
    expect(section).toContain('Content of the first section.');
    expect(section).not.toContain('## Second Section');
  });

  it('includes subsections in parent section', () => {
    const section = extractSection(markdown, 'second-section', headings);

    expect(section).not.toBeNull();
    expect(section).toContain('## Second Section');
    expect(section).toContain('### Subsection');
    expect(section).toContain('Subsection content.');
    expect(section).not.toContain('## Third Section');
  });

  it('extracts subsection only', () => {
    const section = extractSection(markdown, 'subsection', headings);

    expect(section).not.toBeNull();
    expect(section).toContain('### Subsection');
    expect(section).toContain('Subsection content.');
    expect(section).not.toContain('## Second Section');
  });

  it('returns null for non-existent heading', () => {
    const section = extractSection(markdown, 'non-existent', headings);
    expect(section).toBeNull();
  });

  it('handles the last section correctly', () => {
    const section = extractSection(markdown, 'third-section', headings);

    expect(section).not.toBeNull();
    expect(section).toContain('## Third Section');
    expect(section).toContain('Final content.');
  });
});
