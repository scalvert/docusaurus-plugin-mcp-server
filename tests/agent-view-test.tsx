/**
 * The agent view end to end: the theme components render HTML, page
 * extraction reads it. Agents get ForAgents content and not ForHumans
 * content; people get the opposite.
 */
import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { ForAgents, ForHumans } from '../src/theme/index.js';
import { extractPage } from '../src/processing/extract-docs.js';
import { toAgentView } from '../src/agent-view/tree.js';
import { AUDIENCE_ATTRIBUTE, AUDIENCE_PROPERTY } from '../src/agent-view/audience.js';
import { renderDocument } from '../src/agent-view/render.js';
import { DEFAULT_PLUGIN_OPTIONS } from '../src/types/index.js';
import type { Element } from 'hast';
import { unified } from 'unified';
import rehypeParse from 'rehype-parse';

const page = (body: string) =>
  `<html><head><title>Setup</title></head><body><article>${body}</article></body></html>`;

const options = {
  contentSelectors: DEFAULT_PLUGIN_OPTIONS.contentSelectors,
  excludeSelectors: DEFAULT_PLUGIN_OPTIONS.excludeSelectors,
  minContentLength: 10,
};

async function agentMarkdown(body: string) {
  const result = await extractPage(page(body), '/docs/setup', options, () => {});
  if (!('doc' in result)) throw new Error(`skipped: ${result.skipped}`);
  return result.doc;
}

describe('ForAgents / ForHumans', () => {
  it('render the audience attribute; ForAgents is hidden from people', () => {
    expect(renderToStaticMarkup(<ForAgents>a</ForAgents>)).toBe(
      `<div ${AUDIENCE_ATTRIBUTE}="agents" hidden="">a</div>`
    );
    expect(renderToStaticMarkup(<ForHumans>h</ForHumans>)).toBe(
      `<div ${AUDIENCE_ATTRIBUTE}="humans">h</div>`
    );
  });

  it('agents get ForAgents content and not ForHumans content', async () => {
    const body = renderToStaticMarkup(
      <>
        <h1>Setup</h1>
        <p>Open the admin console to configure the connector for your workspace.</p>
        <ForHumans>
          <p>The Configure button is at the top right, in blue.</p>
        </ForHumans>
        <ForAgents>
          <p>If the user is not an admin, stop and tell them an admin must do this step.</p>
        </ForAgents>
      </>
    );
    const doc = await agentMarkdown(body);
    expect(doc.markdown).toContain('Open the admin console');
    expect(doc.markdown).toContain('If the user is not an admin, stop');
    expect(doc.markdown).not.toContain('Configure button');
  });

  it("leaves a heading inside ForHumans out of the document's headings", async () => {
    const body = renderToStaticMarkup(
      <>
        <h1>Setup</h1>
        <p>Every reader sees this paragraph, which is long enough to keep the page.</p>
        <ForHumans>
          <h2 id="screenshots">Screenshots</h2>
          <p>Picture of the console.</p>
        </ForHumans>
        <h2 id="next">Next steps</h2>
        <p>Connect a client.</p>
      </>
    );
    const doc = await agentMarkdown(body);
    expect(doc.headings.map((h) => h.id)).not.toContain('screenshots');
    expect(doc.headings.map((h) => h.id)).toContain('next');
    expect(renderDocument(doc)).not.toContain('Screenshots');
  });

  it('nests: ForAgents inside ForHumans is still left out', async () => {
    const body = renderToStaticMarkup(
      <>
        <h1>Setup</h1>
        <p>Every reader sees this paragraph, which is long enough to keep the page.</p>
        <ForHumans>
          <ForAgents>
            <p>Unreachable agent note.</p>
          </ForAgents>
        </ForHumans>
      </>
    );
    expect((await agentMarkdown(body)).markdown).not.toContain('Unreachable');
  });
});

describe('toAgentView', () => {
  it('reads the attribute under the property name HTML parsing gives it', () => {
    const tree = unified()
      .use(rehypeParse, { fragment: true })
      .parse(`<div ${AUDIENCE_ATTRIBUTE}="humans"></div>`);
    const div = tree.children[0] as Element;
    expect(Object.keys(div.properties)).toEqual([AUDIENCE_PROPERTY]);
  });

  it('never removes the content element itself, and does not mutate its input', () => {
    const content: Element = {
      type: 'element',
      tagName: 'article',
      properties: { [AUDIENCE_PROPERTY]: 'humans' },
      children: [
        {
          type: 'element',
          tagName: 'p',
          properties: { [AUDIENCE_PROPERTY]: 'humans' },
          children: [{ type: 'text', value: 'x' }],
        },
      ],
    };
    const view = toAgentView(content);
    expect(view.tagName).toBe('article');
    expect(view.children).toEqual([]);
    expect(content.children).toHaveLength(1);
  });

  it('keeps unmarked content and unknown audience values', async () => {
    const doc = await agentMarkdown(
      `<h1>Setup</h1><p>Plain paragraph long enough to keep the page around.</p><div ${AUDIENCE_ATTRIBUTE}="robots"><p>Kept.</p></div>`
    );
    expect(doc.markdown).toContain('Plain paragraph');
    expect(doc.markdown).toContain('Kept.');
  });
});
