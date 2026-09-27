/**
 * Ranking quality for the built-in local search, measured with the public
 * evaluateSearch() helper over a small documentation corpus.
 *
 * The corpus and queries target the ways the 1.x FlexSearch ranking failed on
 * real sites. Each has its own test below, with cases that fail if that fix
 * is removed:
 * - every query word had to appear in one field, so natural queries such as
 *   "Cursor MCP setup" dropped the right page;
 * - the route was not indexed, so pages named only by their path were missed;
 * - scores came from list position rather than term statistics, so a long
 *   page that repeats every topic outranked the page about the topic;
 * - plural and singular forms did not match ("route" vs "Routes").
 *
 * The thresholds are floors. If a change lowers them, it made ranking worse.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { LocalSearchIndexer } from '../src/providers/indexers/local-search-indexer.js';
import { LocalSearchProvider } from '../src/providers/search/local-search-provider.js';
import { evaluateSearch, type SearchEvalCase } from '../src/search/evaluate.js';
import type { ProcessedDoc } from '../src/types/index.js';
import type { ProviderContext } from '../src/providers/types.js';

const context: ProviderContext = {
  baseUrl: 'https://docs.example.com',
  serverName: 'ranking-test',
  serverVersion: '0.0.0',
  outputDir: '',
};

function page(route: string, title: string, description: string, body: string): ProcessedDoc {
  const headings = [...body.matchAll(/^(#{1,6})\s+(.+)$/gm)].map((m, i) => ({
    level: m[1]!.length,
    text: m[2]!,
    id: `h${i}`,
    startOffset: m.index ?? 0,
    endOffset: (m.index ?? 0) + m[0].length,
  }));
  return { route, title, description, markdown: body, headings };
}

const corpus: ProcessedDoc[] = [
  page(
    '/docs/intro',
    'Introduction',
    'What the platform does and where to start.',
    '# Introduction\n\nThe platform lets you search and chat over your company knowledge.\n\n## Next steps\n\nRead the quickstart, then set up authentication.'
  ),
  page(
    '/docs/quickstart',
    'Quickstart',
    'Make your first API call in five minutes.',
    '# Quickstart\n\nCreate a token, install a client, and make your first request.\n\n## Install a client\n\nnpm install @example/client'
  ),
  page(
    '/docs/authentication/tokens',
    'API tokens',
    'Create and scope API tokens.',
    '# API tokens\n\nCreate a token in the admin console. Tokens can be user-scoped or global.\n\n## Scopes\n\nGrant only the scopes your app needs.\n\n## Rotating tokens\n\nRotate tokens on a schedule.'
  ),
  page(
    '/docs/authentication/oauth',
    'OAuth',
    'Authenticate users with OAuth 2.0.',
    '# OAuth\n\nUse OAuth 2.0 with PKCE so each user signs in with their own identity.\n\n## Dynamic client registration\n\nClients can register themselves.'
  ),
  page(
    '/docs/errors/rate-limit-exceeded',
    'Rate limit exceeded',
    'The request was throttled.',
    '# Rate limit exceeded\n\nThe server returned HTTP 429 Too Many Requests. Wait for the Retry-After interval, then retry with backoff.'
  ),
  page(
    '/docs/errors/expired-cursor',
    'Expired cursor',
    'A pagination cursor is no longer valid.',
    '# Expired cursor\n\nCursors expire after one hour. Start the listing again from the first page.'
  ),
  page(
    '/docs/api/search',
    'Search',
    'Search indexed content.',
    '# Search\n\nPOST /api/search\n\n## Request body\n\n`query` (string) and optional `filters`.\n\n## Response\n\nRanked results with a cursor.'
  ),
  page(
    '/docs/api/search-filters',
    'Search filters',
    'Discover the filter fields and values a datasource supports.',
    '# Search filters\n\nGET /api/search/filters returns each datasource and the facet values you can filter on.'
  ),
  page(
    '/docs/guides/filtering-results',
    'Filtering results',
    'Narrow search results by datasource, type, or date.',
    '# Filtering results\n\nPass filters in the search request to limit results to a datasource or a document type.'
  ),
  page(
    '/docs/api/chat-stream',
    'Stream chat',
    'Stream chat responses as server-sent events.',
    '# Stream chat\n\nPOST /api/chat with `stream: true` returns server-sent events as the answer is generated.'
  ),
  page(
    '/docs/guides/citations',
    'Citations',
    'Link answers to the sources they came from.',
    '# Citations\n\nEach chat message includes citations with the source document and the quoted range.'
  ),
  page(
    '/docs/agents/runs/cancel',
    'Cancel a run',
    'Stop an agent run that is in progress.',
    '# Cancel a run\n\nPOST /api/agents/{id}/runs/{run_id}/cancellations stops a run.'
  ),
  page(
    '/docs/agents/runs/create',
    'Create a run',
    'Start an agent and wait for its output.',
    '# Create a run\n\nPOST /api/agents/{id}/runs starts the agent. Poll the run until it completes to get the result.'
  ),
  page(
    '/docs/indexing/bulk-index-documents',
    'Bulk index documents',
    'Replace a datasource with a full upload.',
    '# Bulk index documents\n\nUpload every document in batches. Documents missing from the upload are deleted.'
  ),
  page(
    '/docs/indexing/delete-document',
    'Delete document',
    'Remove one document from a datasource.',
    '# Delete document\n\nPOST /api/index/deletedocument with the datasource and document id.'
  ),
  page(
    '/docs/sdk/pagination',
    'Pagination',
    'Page through a source API in a connector.',
    '# Pagination\n\nConnectors fetch a source page by page using cursors or offsets.'
  ),
  page(
    '/docs/mcp/cursor',
    'Connect Cursor',
    'Add the MCP server to Cursor.',
    '# Connect Cursor\n\nOpen settings, add a new MCP server, and paste the server URL. Sign in when prompted.'
  ),
  page(
    '/docs/mcp/claude-code',
    'Connect Claude Code',
    'Add the MCP server to Claude Code.',
    '# Connect Claude Code\n\nRun `claude mcp add` with the server URL, then sign in.'
  ),
  page(
    '/docs/mcp/troubleshooting',
    'Troubleshooting',
    'Fix connection and tool loading problems.',
    '# Troubleshooting\n\n## Tools do not load\n\nReconnect the host and confirm the server is enabled.\n\n## Sign-in fails\n\nClear stored credentials and sign in again.'
  ),
  page(
    '/docs/libraries/go',
    'Go',
    'Install and use the Go library.',
    '# Go\n\ngo get example.com/client-go'
  ),
  page(
    '/docs/libraries/python',
    'Python',
    'Install and use the Python library.',
    '# Python\n\npip install example-client'
  ),
  // A long page that touches every topic once somewhere, like a real
  // changelog. 1.x ranking put pages like this in the top results for most
  // queries because it matched every term.
  page(
    '/changelog',
    'Changelog',
    'Every release.',
    '# Changelog\n\n' +
      [
        'Search filters now include facet values for every datasource.',
        'Chat streaming sends server-sent events sooner.',
        'Citations include the quoted range.',
        'OAuth supports dynamic client registration.',
        'API token scopes can be narrowed after creation.',
        'Agent runs report progress while they wait.',
        'You can cancel runs that are in progress.',
        'Bulk index documents accepts larger batches.',
        'Delete document returns the deleted id.',
        'Connector pagination handles offsets.',
        'Rate limit responses include Retry-After.',
        'Expired cursor errors explain how to restart.',
        'Cursor MCP setup opens the configurator.',
        'Claude Code MCP setup uses claude mcp add.',
        'Troubleshooting covers tools that do not load.',
        'The Go library adds retries.',
        'The Python library adds type hints.',
        'The quickstart uses the new client.',
      ]
        .map(
          (note, i) =>
            `## Release ${i + 1}\n\n${note} Also includes stability and performance fixes.`
        )
        .join('\n\n')
  ),
  // Pages identified only by their route: the query words are in the path,
  // not the title or body.
  page(
    '/docs/errors/session-timeout',
    'Error E1042',
    'Returned by the API gateway.',
    '# Error E1042\n\nRequest a new credential and retry.'
  ),
  page(
    '/docs/webhooks/signature-verification',
    'HMAC checks',
    'Confirm a delivery came from us.',
    '# HMAC checks\n\nCompare the header against a hash of the body using your shared secret.'
  ),
  // Two pages mention "concurrency quota" in their bodies only. One is short
  // and about it; the other is a long page that mentions it more often in
  // passing. Without length normalization, the long page's raw counts win.
  page(
    '/docs/guides/burst-handling',
    'Handle bursts',
    '',
    'Set a concurrency quota so bursts are queued, not dropped.'
  ),
  page(
    '/docs/guides/operations-log',
    'Operations log',
    '',
    Array.from({ length: 4 }, (_, week) =>
      Array.from({ length: 300 }, (_, i) => `task${(week * 300 + i) % 89}`).join(' ')
    ).join(' concurrency quota ')
  ),
  // The query uses a different inflection than the page, and not a prefix of
  // it ("crawls" vs "Crawl"), so only stemming connects them.
  page(
    '/docs/guides/crawler',
    'Crawl scheduling',
    'When content is fetched.',
    'Each crawl runs on a schedule you set.'
  ),
];

const cases: SearchEvalCase[] = [
  // Natural multi-word queries: not every word is on the right page.
  { query: 'Cursor MCP setup', expected: ['/docs/mcp/cursor'] },
  { query: 'connect Claude Code to the MCP server', expected: ['/docs/mcp/claude-code'] },
  { query: 'MCP tools not loading', expected: ['/docs/mcp/troubleshooting'] },
  { query: 'run an agent and wait for the result', expected: ['/docs/agents/runs/create'] },
  { query: 'how do I stream chat responses', expected: ['/docs/api/chat-stream'] },
  { query: 'discover filter values for a datasource', expected: ['/docs/api/search-filters'] },
  {
    query: 'narrow search results by datasource',
    expected: ['/docs/guides/filtering-results', '/docs/api/search-filters'],
  },
  // Named by the route more than the title.
  { query: 'expired cursor error', expected: ['/docs/errors/expired-cursor'] },
  { query: 'rate limit exceeded', expected: ['/docs/errors/rate-limit-exceeded'] },
  { query: 'delete a document', expected: ['/docs/indexing/delete-document'] },
  { query: 'bulk index documents', expected: ['/docs/indexing/bulk-index-documents'] },
  { query: 'cancel an agent run', expected: ['/docs/agents/runs/cancel'] },
  // Short, precise queries.
  { query: 'Go client library', expected: ['/docs/libraries/go'] },
  { query: 'Python install', expected: ['/docs/libraries/python'] },
  { query: 'OAuth', expected: ['/docs/authentication/oauth'] },
  { query: 'create an API token', expected: ['/docs/authentication/tokens'] },
  { query: 'rotate tokens', expected: ['/docs/authentication/tokens'] },
  { query: 'citations', expected: ['/docs/guides/citations'] },
  { query: 'connector pagination', expected: ['/docs/sdk/pagination'] },
  { query: 'quickstart', expected: ['/docs/quickstart'] },
  { query: 'search request body', expected: ['/docs/api/search'] },
  { query: '429 too many requests', expected: ['/docs/errors/rate-limit-exceeded'] },
];

// Query words appear only in the route of the page that answers them.
const routeOnlyCases: SearchEvalCase[] = [
  { query: 'session timeout', expected: ['/docs/errors/session-timeout'] },
  { query: 'signature verification', expected: ['/docs/webhooks/signature-verification'] },
];

const longPageCases: SearchEvalCase[] = [
  { query: 'concurrency quota', expected: ['/docs/guides/burst-handling'] },
];

const inflectionCases: SearchEvalCase[] = [
  { query: 'crawls', expected: ['/docs/guides/crawler'] },
  { query: 'scheduled crawling', expected: ['/docs/guides/crawler'] },
];

describe('local search ranking', () => {
  let provider: LocalSearchProvider;

  beforeAll(async () => {
    const indexer = new LocalSearchIndexer();
    await indexer.initialize(context);
    await indexer.indexDocuments(corpus);
    const artifacts = await indexer.finalize();

    provider = new LocalSearchProvider();
    await provider.initialize(context, {
      docs: artifacts.get('docs.json') as Record<string, ProcessedDoc>,
      indexData: artifacts.get('search-index.json') as Record<string, unknown>,
    });
  });

  async function expectAllFirst(set: SearchEvalCase[]) {
    const report = await evaluateSearch(provider, set);
    const misses = report.cases
      .filter((c) => c.rank !== 1)
      .map((c) => `${c.query} -> rank ${c.rank ?? 'none'}, got ${c.routes.slice(0, 3).join(', ')}`);
    expect(misses).toEqual([]);
  }

  it('finds pages named only by their route', async () => {
    await expectAllFirst(routeOnlyCases);
  });

  it('ranks a short page about a topic above a long page that repeats it', async () => {
    await expectAllFirst(longPageCases);
  });

  it('matches other inflections of a word, not just prefixes', async () => {
    await expectAllFirst(inflectionCases);
  });

  it('ranks the right page first for nearly every query', async () => {
    const report = await evaluateSearch(provider, cases);
    const misses = report.cases
      .filter((c) => c.rank !== 1)
      .map((c) => `${c.query} -> rank ${c.rank ?? 'none'}, got ${c.routes.slice(0, 3).join(', ')}`);

    expect(report.hitsAt[3], misses.join('\n')).toBe(report.total);
    expect(report.hitsAt[1]! / report.total, misses.join('\n')).toBeGreaterThanOrEqual(0.9);
    expect(report.mrr).toBeGreaterThanOrEqual(0.95);
  });

  it('never ranks a long page that mentions everything above the page about the topic', async () => {
    // On a corpus this small the changelog can fill a lower slot when few
    // other pages match; what must not happen is that it wins.
    const report = await evaluateSearch(provider, cases);
    const changelogFirst = report.cases
      .filter((c) => {
        const changelogRank = c.routes.indexOf('/changelog');
        return changelogRank !== -1 && (c.rank === null || changelogRank < c.rank - 1);
      })
      .map((c) => `${c.query}: ${c.routes.slice(0, 3).join(', ')}`);

    expect(changelogFirst).toEqual([]);
  });
});

describe('evaluateSearch', () => {
  it('reports hits at each cutoff and mean reciprocal rank', async () => {
    const fake = {
      name: 'fake',
      initialize: async () => {},
      isReady: () => true,
      search: async (query: string) =>
        ['/a', '/b', '/c'].map((route) => ({
          url: `https://x${route}`,
          route,
          title: route,
          score: 1,
          snippet: query,
        })),
    };

    const report = await evaluateSearch(fake, [
      { query: 'first', expected: ['/a'] },
      { query: 'third by url', expected: ['https://x/c'] },
      { query: 'missing', expected: ['/z'] },
    ]);

    expect(report.total).toBe(3);
    expect(report.hitsAt).toEqual({ 1: 1, 3: 2, 5: 2 });
    expect(report.mrr).toBeCloseTo((1 + 1 / 3) / 3);
    expect(report.cases.map((c) => c.rank)).toEqual([1, 3, null]);
  });

  it('honors custom cutoffs and limit, and reports zero for no cases', async () => {
    let requested: number | undefined;
    const fake = {
      name: 'fake',
      initialize: async () => {},
      isReady: () => true,
      search: async (_query: string, options?: { limit?: number }) => {
        requested = options?.limit;
        return [{ url: 'https://x/b', route: '/b', title: 'b', score: 1, snippet: '' }];
      },
    };

    const report = await evaluateSearch(fake, [{ query: 'q', expected: ['/b'] }], {
      k: [2, 10],
      limit: 4,
    });
    expect(requested).toBe(4);
    expect(report.hitsAt).toEqual({ 2: 1, 10: 1 });

    const empty = await evaluateSearch(fake, []);
    expect(empty).toMatchObject({ total: 0, mrr: 0, hitsAt: { 1: 0, 3: 0, 5: 0 }, cases: [] });
  });
});
