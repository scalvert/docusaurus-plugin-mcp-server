/**
 * Agent guides end to end: pages rendered from the real theme components,
 * read by page extraction, compiled into skills. The compiled files are
 * goldens (tests/__golden__/guides/); regenerate with
 * `npx vitest run tests/guides-test.tsx -u` and review the diff.
 */
import { describe, it, expect } from 'vitest';
import type { ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  AgentGuide,
  Check,
  DoneWhen,
  ForAgents,
  ForHumans,
  Prerequisites,
  Step,
  Symptom,
} from '../src/theme/index.js';
import { extractPage } from '../src/processing/extract-docs.js';
import { compileGuides } from '../src/guides/compile.js';
import type { PageGuides } from '../src/guides/extract.js';
import { DEFAULT_PLUGIN_OPTIONS } from '../src/types/index.js';

const BASE = 'https://developers.glean.com/';
const options = {
  contentSelectors: DEFAULT_PLUGIN_OPTIONS.contentSelectors,
  excludeSelectors: DEFAULT_PLUGIN_OPTIONS.excludeSelectors,
  minContentLength: 10,
};

/** A built page, shaped like Docusaurus output: content in an <article>, a navbar outside it. */
function html(title: string, body: string, outside = '') {
  return `<!doctype html><html><head><title>${title} | Docs</title></head><body><nav>${outside}</nav><main><article><h1>${title}</h1>${body}</article></main></body></html>`;
}

async function pageGuides(route: string, title: string, body: ReactElement | string, outside = '') {
  const markup = typeof body === 'string' ? body : renderToStaticMarkup(body);
  const result = await extractPage(html(title, markup, outside), route, options, () => {});
  if (!('doc' in result)) throw new Error(`page skipped: ${result.skipped}`);
  return { doc: result.doc, guides: result.guides };
}

async function compile(...pages: Array<PageGuides | undefined>) {
  return compileGuides({
    pages: pages.filter((p): p is PageGuides => p !== undefined),
    baseUrl: BASE,
  });
}

function file(compiled: Awaited<ReturnType<typeof compile>>, skill: string, path: string): string {
  const source = compiled.sources.find((s) => s.name === skill);
  const found = source?.files.find((f) => f.path === path);
  if (!found) throw new Error(`no ${path} in ${skill}`);
  return found.bytes.toString('utf8');
}

/** The example from docs/agent-guide-format.md. */
const setupPage = (
  <AgentGuide
    name="setup-remote-mcp"
    kind="setup"
    description="Connect an MCP host to Glean's remote MCP server. Use when the user wants to install, set up, or connect Glean MCP."
  >
    <DoneWhen>The host lists Glean&apos;s tools, and a test search returns results.</DoneWhen>
    <Prerequisites>
      <ul>
        <li>
          A Glean account. Check: the user can sign in at <code>app.glean.com</code>.
        </li>
        <li>
          Remote MCP is turned on for the user&apos;s company. Only a Glean admin can check this.
        </li>
      </ul>
    </Prerequisites>
    <Step id="open-configurator" title="Open the MCP Configurator" needs="user">
      <p>
        Go to <strong>Admin console → Platform → MCP</strong>.
      </p>
      <ForHumans>
        The Configurator is the <strong>Configure</strong> button at the top right.
      </ForHumans>
      <ForAgents>
        If the user isn&apos;t a Glean admin, stop here and tell them an admin has to do this step.
      </ForAgents>
      <Check>
        The page shows a server URL ending in <code>/mcp/default</code>.
      </Check>
    </Step>
    <Step id="add-server" symptoms="invalid-token">
      <h3 id="add-the-server-to-the-host">Add the server to the host</h3>
      <pre>
        <code className="language-bash">
          claude mcp add --transport http glean https://example-be.glean.com/mcp/default
        </code>
      </pre>
      <Check>
        <code>claude mcp list</code> shows <code>glean</code> as connected.
      </Check>
    </Step>
    <Step id="restart-host" title="Restart the host" confirm>
      <p>Quit and reopen the host. Unsaved work in the host is lost.</p>
    </Step>
  </AgentGuide>
);

const troubleshootingPage = (
  <>
    <p>Problems connecting a host to Glean, and how to fix them.</p>
    <Symptom
      id="invalid-token"
      guide="setup-remote-mcp"
      title="`401 invalid_token` when the host connects"
    >
      <p>
        <strong>Cause:</strong> The host is sending a token from a different Glean instance.
      </p>
      <p>
        <strong>Fix:</strong> Remove the server from the host, add it again with the URL from the
        Configurator, and sign in when the host asks.
      </p>
      <Check>
        <code>claude mcp list</code> shows <code>glean</code> as connected.
      </Check>
      <p>
        <strong>Escalate if:</strong> the error persists after signing in again. The company&apos;s
        SSO settings may block the host.
      </p>
    </Symptom>
  </>
);

describe('a setup guide with a symptom on another page', () => {
  it('compiles to the format’s SKILL.md and troubleshooting.md', async () => {
    const setup = await pageGuides('/guides/mcp/setup', 'Connect an MCP host to Glean', setupPage);
    const trouble = await pageGuides(
      '/guides/mcp/troubleshooting',
      'Troubleshooting',
      troubleshootingPage
    );
    const compiled = await compile(trouble.guides, setup.guides);

    expect(compiled.errors).toEqual([]);
    expect(compiled.warnings).toEqual([
      '/guides/mcp/setup: guide "setup-remote-mcp": step "restart-host" has no <Check>',
    ]);
    expect(compiled.sources.map((s) => [s.name, s.kind, s.files.map((f) => f.path)])).toEqual([
      ['setup-remote-mcp', 'guide', ['SKILL.md', 'references/troubleshooting.md']],
    ]);
    await expect(file(compiled, 'setup-remote-mcp', 'SKILL.md')).toMatchFileSnapshot(
      '__golden__/guides/setup-remote-mcp/SKILL.md'
    );
    await expect(
      file(compiled, 'setup-remote-mcp', 'references/troubleshooting.md')
    ).toMatchFileSnapshot('__golden__/guides/setup-remote-mcp/references/troubleshooting.md');
  });

  it('keeps reader labels and ForHumans text out of the guide, but in the page document as the agent view allows', async () => {
    const setup = await pageGuides('/guides/mcp/setup', 'Connect an MCP host to Glean', setupPage);
    // The page's document keeps the reader labels (step titles, "Check:")...
    expect(setup.doc.markdown).toContain('**Open the MCP Configurator**');
    expect(setup.doc.markdown).toContain('**Check:**');
    // ...and, like every document, leaves ForHumans content out.
    expect(setup.doc.markdown).not.toContain('Configure');
    expect(setup.doc.markdown).toContain('stop here and tell them');
  });
});

describe('a troubleshooting guide', () => {
  it('compiles symptoms only, with the troubleshooting how-to text', async () => {
    const page = await pageGuides(
      '/help/search',
      'Search problems',
      <AgentGuide
        name="fix-search"
        kind="troubleshooting"
        description="Fix search that returns nothing. Use when results are missing."
      >
        <DoneWhen>A search for a known page title returns that page.</DoneWhen>
        <Symptom id="no-results" title="Search returns no results">
          <p>
            <strong>Cause:</strong> The index wasn&apos;t built.
          </p>
          <p>
            <strong>Fix:</strong> Run the build again.
          </p>
          <Check>A search for the page title returns the page.</Check>
        </Symptom>
      </AgentGuide>
    );
    const compiled = await compile(page.guides);
    expect(compiled.errors).toEqual([]);
    expect(compiled.warnings).toEqual([]);
    await expect(file(compiled, 'fix-search', 'SKILL.md')).toMatchFileSnapshot(
      '__golden__/guides/fix-search/SKILL.md'
    );
    await expect(file(compiled, 'fix-search', 'references/troubleshooting.md')).toMatchFileSnapshot(
      '__golden__/guides/fix-search/references/troubleshooting.md'
    );
  });
});

describe('titles from headings, for wrapping existing sections', () => {
  it('takes a step title from its heading, dropping the page’s step number', async () => {
    const page = await pageGuides(
      '/start',
      'Getting started',
      <AgentGuide name="start" kind="setup" description="Start. Use when starting.">
        <DoneWhen>It runs.</DoneWhen>
        <Step id="install">
          <h2 id="1-install-the-plugin">1. Install the plugin</h2>
          <p>Run the installer.</p>
          <Check>It is installed.</Check>
        </Step>
      </AgentGuide>
    );
    expect(page.guides?.guides[0]?.steps[0]).toMatchObject({
      title: 'Install the plugin',
      body: 'Run the installer.',
    });
    // The page keeps its heading, number and all.
    expect(page.doc.headings.map((h) => h.text)).toContain('1. Install the plugin');
  });

  it('takes a symptom title from its heading, and links to the heading’s anchor', async () => {
    const setup = await pageGuides(
      '/start',
      'Getting started',
      <AgentGuide name="start" kind="setup" description="Start. Use when starting.">
        <DoneWhen>It runs.</DoneWhen>
        <Step id="run" title="Run it" symptoms="stale">
          <Check>It answers.</Check>
        </Step>
      </AgentGuide>
    );
    const trouble = await pageGuides(
      '/trouble',
      'Troubleshooting',
      <Symptom id="stale" guide="start">
        <h2 id="the-endpoint-serves-old-content">The endpoint serves old content</h2>
        <p>The bundle is baked in at deploy time. Redeploy after rebuilding.</p>
      </Symptom>
    );
    const compiled = await compile(setup.guides, trouble.guides);
    expect(compiled.errors).toEqual([]);
    const troubleshooting = file(compiled, 'start', 'references/troubleshooting.md');
    expect(troubleshooting).toContain('## The endpoint serves old content {#stale}');
    expect(troubleshooting).toContain(
      'Source: https://developers.glean.com/trouble#the-endpoint-serves-old-content'
    );
    expect(troubleshooting.match(/The endpoint serves old content/g)).toHaveLength(1);
    expect(renderToStaticMarkup(<Symptom id="stale">x</Symptom>)).not.toContain('id="stale"');
  });
});

/** Raw attribute markup: the contract is the HTML, so any component can render it. */
const guide = (attrs: string, body: string) =>
  `<div data-mcp-guide="g" data-mcp-guide-kind="setup" data-mcp-guide-description="d" ${attrs}>${body}</div>`;
const done = '<div data-mcp-done-when=""><p>Done.</p></div>';
const step = (
  id: string,
  body = '<p>Do it.</p><div data-mcp-check=""><p>It worked.</p></div>',
  attrs = ''
) => `<div data-mcp-step="${id}" data-mcp-step-title="Step ${id}" ${attrs}>${body}</div>`;
const symptom = (id: string, attrs = '') =>
  `<div data-mcp-symptom="${id}" data-mcp-symptom-title="Error ${id}" ${attrs}><p><strong>Fix:</strong> x</p></div>`;

describe('build checks', () => {
  async function problems(...pages: Array<[route: string, body: string]>) {
    const extracted = await Promise.all(
      pages.map(([route, body]) =>
        pageGuides(
          route,
          'Page',
          `<p>This paragraph has enough text for extraction to pick the article.</p>${body}`
        )
      )
    );
    return compile(...extracted.map((p) => p.guides));
  }

  it.each<[string, string, string]>([
    [
      'no name',
      `<div data-mcp-guide="" data-mcp-guide-kind="setup" data-mcp-guide-description="d">${done}${step('a')}</div>`,
      'guide has no name',
    ],
    [
      'an invalid name',
      guide('', done + step('a')).replace('data-mcp-guide="g"', 'data-mcp-guide="Bad_Name"'),
      `name "Bad_Name" isn't a valid skill name`,
    ],
    [
      'no kind',
      guide('', done + step('a')).replace('data-mcp-guide-kind="setup"', ''),
      'has no kind',
    ],
    [
      'an unknown kind',
      guide('', done + step('a')).replace('kind="setup"', 'kind="howto"'),
      'kind "howto" must be one of setup, troubleshooting',
    ],
    [
      'no description',
      guide('', done + step('a')).replace('data-mcp-guide-description="d"', ''),
      'has no description',
    ],
    ['no DoneWhen', guide('', step('a')), 'has no <DoneWhen>'],
    ['two DoneWhens', guide('', done + done + step('a')), 'has 2 <DoneWhen> blocks'],
    ['no steps', guide('', done), 'is a setup guide with no steps'],
    ['a step with no id', guide('', done + step('')), 'step 1 has no id'],
    [
      'two steps sharing an id',
      guide('', done + step('a') + step('a')),
      'two steps have the id "a"',
    ],
    [
      'a step naming a missing symptom',
      guide('', done + step('a', undefined, 'data-mcp-step-symptoms="nope"')),
      'names symptom "nope"',
    ],
    [
      'two symptoms sharing an id',
      guide('', done + step('a') + symptom('s') + symptom('s')),
      'two symptoms have the id "s"',
    ],
    [
      'a symptom with no title',
      guide('', done + step('a') + symptom('s').replace(/data-mcp-symptom-title="[^"]*"/, '')),
      'symptom "s" has no title',
    ],
    [
      'a step in a troubleshooting guide',
      guide('', done + step('a')).replace('kind="setup"', 'kind="troubleshooting"'),
      "can't be in troubleshooting guide",
    ],
    [
      'a nested guide',
      guide('', done + step('a') + guide('', done)),
      "can't be nested in another guide",
    ],
    ['a step outside a guide', step('a'), '<Step> must be inside an <AgentGuide>'],
    [
      'a step inside a step',
      guide('', done + step('a', step('b'))),
      "can't be inside another <Step>",
    ],
    [
      'a check outside a step or symptom',
      guide('', done + step('a') + '<div data-mcp-check=""><p>x</p></div>'),
      '<Check> must be inside a <Step> or <Symptom>',
    ],
    [
      'a symptom inside a step',
      guide('', done + step('a', symptom('s'))),
      "<Symptom> can't be inside a <Step>",
    ],
    [
      'a step inside a DoneWhen',
      guide('', `<div data-mcp-done-when="">${step('a')}</div>` + step('b')),
      "<Step> can't be inside <DoneWhen>",
    ],
    ['a symptom outside a guide with no guide prop', symptom('s'), 'needs a guide prop'],
    [
      'a symptom naming a missing guide',
      symptom('s', 'data-mcp-symptom-guide="nope"'),
      'names guide "nope", which doesn\'t exist',
    ],
    [
      'a shared symptom naming one missing guide among others',
      guide('', done + step('a')) + symptom('s', 'data-mcp-symptom-guide="g nope"'),
      'names guide "nope", which doesn\'t exist',
    ],
    [
      'a symptom inside a guide naming other guides',
      guide('', done + step('a') + symptom('s', 'data-mcp-symptom-guide="g other"')),
      'is inside guide "g" but names guide "other"',
    ],
  ])('fails on %s', async (_label, body, expected) => {
    const { errors } = await problems(['/p', body]);
    expect(errors.join('\n')).toContain(expected);
  });

  it('fails on two guides sharing a name, across pages', async () => {
    const { errors } = await problems(
      ['/a', guide('', done + step('a'))],
      ['/b', guide('', done + step('a'))]
    );
    expect(errors).toContain('/b: guide "g" has the same name as the guide on /a');
  });

  it('reports every problem, not just the first', async () => {
    const { errors } = await problems(['/p', guide('', step('') + step('b'))]);
    expect(errors).toHaveLength(2);
  });

  it('warns about a step without a check, a guide without symptoms, and a step without a title', async () => {
    const { errors, warnings } = await problems([
      '/p',
      guide('', done + '<div data-mcp-step="a"><p>Do it.</p></div>'),
    ]);
    expect(errors).toEqual([]);
    expect(warnings).toEqual([
      '/p: guide "g": step "a" has no title or heading; using its id',
      '/p: guide "g": step "a" has no <Check>',
      '/p: guide "g" has no symptoms',
    ]);
  });

  it('warns about markup outside the content element, and ignores it', async () => {
    const page = await pageGuides(
      '/p',
      'Page',
      '<p>This paragraph has enough text for extraction to pick the article.</p>',
      step('nav')
    );
    const compiled = await compile(page.guides);
    expect(compiled.errors).toEqual([]);
    expect(compiled.warnings).toEqual([
      "/p: 2 element(s) with data-mcp-* attributes are outside the page's content element (contentSelectors), so they're ignored",
    ]);
  });

  it('leaves pages without guide markup alone', async () => {
    const page = await pageGuides(
      '/p',
      'Page',
      '<p>A plain page, with enough text for extraction to pick the article.</p>'
    );
    expect(page.guides).toBeUndefined();
  });

  it('drops a guide inside ForHumans, since agents never see it', async () => {
    const page = await pageGuides(
      '/p',
      'Page',
      `<p>This paragraph has enough text for extraction to pick the article.</p><div data-mcp-audience="humans">${guide('', done + step('a'))}</div>`
    );
    expect(page.guides).toBeUndefined();
  });
});

const ENOUGH = '<p>This paragraph has enough text for extraction to pick the article.</p>';

describe('shared symptoms', () => {
  it('attaches a symptom outside the guides to every guide it names', async () => {
    const named = (name: string) =>
      guide('', done + step('a')).replace('data-mcp-guide="g"', `data-mcp-guide="${name}"`);
    const guides = await pageGuides(
      '/deploy',
      'Deploy',
      ENOUGH + named('deploy-a') + named('deploy-b')
    );
    const shared = await pageGuides(
      '/troubleshooting',
      'Troubleshooting',
      ENOUGH + symptom('status-500', 'data-mcp-symptom-guide="deploy-a deploy-b"')
    );
    const compiled = await compile(guides.guides, shared.guides);
    expect(compiled.errors).toEqual([]);
    for (const name of ['deploy-a', 'deploy-b']) {
      expect(file(compiled, name, 'SKILL.md')).toContain(
        '[Error status-500](references/troubleshooting.md#status-500)'
      );
      expect(file(compiled, name, 'references/troubleshooting.md')).toContain(
        '## Error status-500 {#status-500}'
      );
    }
  });
});

describe('links in guides', () => {
  const body =
    '<p>See <a href="/docs/reference/options">options</a>, <a href="#check-it">the check</a>, ' +
    '<a href="../deploy/">deploying</a>, and <a href="https://example.org/x">elsewhere</a>.</p>' +
    '<p><img src="/img/diagram.png" alt="Diagram"></p>' +
    '<div data-mcp-check=""><p>Run <code>curl</code>; see <a href="/docs/status">status</a>.</p></div>';

  it('resolve against the page URL, so a guide read away from the site still works', async () => {
    const result = await extractPage(
      html('Setup', ENOUGH + guide('', done + step('a', body))),
      '/docs/guides/setup',
      { ...options, baseUrl: 'https://docs.example.com/' },
      () => {}
    );
    if (!('doc' in result)) throw new Error('page skipped');
    const compiled = await compile(result.guides);
    const skill = file(compiled, 'g', 'SKILL.md');
    expect(skill).toContain('[options](https://docs.example.com/docs/reference/options)');
    expect(skill).toContain('[the check](https://docs.example.com/docs/guides/setup#check-it)');
    expect(skill).toContain('[deploying](https://docs.example.com/docs/deploy/)');
    expect(skill).toContain('[elsewhere](https://example.org/x)');
    expect(skill).toContain('![Diagram](https://docs.example.com/img/diagram.png)');
    expect(skill).toContain('[status](https://docs.example.com/docs/status)');
    // The page's own document keeps the links as the page wrote them.
    expect(result.doc.markdown).toContain('[options](/docs/reference/options)');
  });

  it('stay as the page wrote them without a site URL', async () => {
    const page = await pageGuides(
      '/docs/guides/setup',
      'Setup',
      ENOUGH + guide('', done + step('a', body))
    );
    const skill = file(await compile(page.guides), 'g', 'SKILL.md');
    expect(skill).toContain('[options](/docs/reference/options)');
  });
});
