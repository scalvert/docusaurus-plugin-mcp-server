// The MCP endpoint's analytics mapping (api/_lib/mcp-analytics.mjs). Runs with
// `npm test` (node --test); needs no build.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { analyticsEventFor, clientId, fetchedPage, topResult } from '../api/_lib/mcp-analytics.mjs';

const QUERY = 'how do I rotate my token sk-live-123';
const SITE = 'https://docusaurus-plugin-mcp-server.vercel.app';

function search(overrides = {}) {
  return {
    type: 'tool_call',
    tool: 'docs_search',
    ok: true,
    durationMs: 3,
    query: QUERY,
    limit: 16,
    resultCount: 2,
    results: [
      { url: `${SITE}/docs/deploy/vercel`, route: '/docs/deploy/vercel' },
      { url: `${SITE}/docs/getting-started`, route: '/docs/getting-started' },
    ],
    ...overrides,
  };
}

function fetchEvent(overrides = {}) {
  return {
    type: 'tool_call',
    tool: 'docs_fetch',
    ok: true,
    durationMs: 3,
    uri: `${SITE}/docs/deploy/vercel?token=secret#notes`,
    resolved: 'document',
    documentId: `${SITE}/docs/deploy/vercel`,
    ...overrides,
  };
}

describe('analyticsEventFor', () => {
  it('reports the first result of a search, and never the query', () => {
    const event = analyticsEventFor(search());
    assert.deepEqual(event, {
      name: 'mcp_search',
      properties: { top: '/docs/deploy/vercel', client: 'unknown' },
    });
    assert.ok(!JSON.stringify(event).includes('token'));
  });

  it('reports the page a fetch read, and never the URI sent', () => {
    const event = analyticsEventFor(fetchEvent());
    assert.deepEqual(event, {
      name: 'mcp_fetch',
      properties: { page: '/docs/deploy/vercel', client: 'unknown' },
    });
    assert.ok(!JSON.stringify(event).includes('secret'));
  });

  it('names the client when the call says which it is', () => {
    const event = analyticsEventFor(search({ client: { name: 'Claude Code', version: '2.1' } }));
    assert.equal(event.properties.client, 'claude-code');
  });
});

describe('topResult', () => {
  it('is none for a search that found nothing, and error for a failed one', () => {
    assert.equal(topResult(search({ resultCount: 0, results: [] })), 'none');
    assert.equal(topResult(search({ results: undefined })), 'none');
    assert.equal(
      topResult(search({ ok: false, resultCount: undefined, results: undefined })),
      'error'
    );
  });

  it('drops a query string and fragment from the result URL', () => {
    assert.equal(
      topResult(search({ results: [{ url: `${SITE}/docs/x?a=1#b`, route: '/docs/x' }] })),
      '/docs/x'
    );
  });
});

describe('fetchedPage', () => {
  it('reports skill files, missing pages, and errors without the URI', () => {
    assert.equal(
      fetchedPage(fetchEvent({ resolved: 'skill-file', documentId: undefined })),
      'skill'
    );
    assert.equal(
      fetchedPage(fetchEvent({ resolved: 'not-found', documentId: undefined })),
      'not-found'
    );
    assert.equal(
      fetchedPage(fetchEvent({ ok: false, resolved: undefined, documentId: undefined })),
      'error'
    );
  });
});

describe('clientId', () => {
  it('turns a reported name into an ID, or unknown', () => {
    assert.equal(clientId('Cursor'), 'cursor');
    assert.equal(clientId('  claude_code / beta '), 'claude-code-beta');
    assert.equal(clientId(undefined), 'unknown');
    assert.equal(clientId('***'), 'unknown');
    assert.equal(clientId('a'.repeat(300)).length, 64);
  });
});
