/**
 * Golden (characterization) test for the MCP tool wire output: the raw
 * JSON-RPC responses to tools/list and tools/call, in both protocol eras,
 * for the default server and for each way the tool handlers branch
 * (description overrides, a provider that throws, a provider that is not
 * ready, a provider without getDocument).
 *
 * The snapshot files are the contract. A change that alters them must be
 * intended, and the diff reviewed. Regenerate with:
 *   npx vitest run tests/tool-wire-golden-test.ts -u
 *
 * Each snapshot is an ordered list of exchanges: the request label, the HTTP
 * status, the content-type, the parsed response body, and (only when
 * non-empty) what the server wrote to console.error while handling it,
 * reduced to strings (errors as "name: message", no stacks).
 *
 * Nothing is normalized: request ids are fixed, the bundle's build time is
 * fixed by buildTestBundle, and no response carries a timestamp, path, or
 * score. The files are written through Prettier (the repo's config) so
 * `prettier --check` passes; that changes whitespace only.
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import path from 'node:path';
import * as prettier from 'prettier';
import { McpDocsServer } from '../src/mcp/server.js';
import type { McpServerToolsConfig, ProcessedDoc, SearchResult } from '../src/types/index.js';
import type { SearchProvider } from '../src/providers/types.js';
import type { ArtifactBundle } from '../src/artifacts/bundle.js';
import { buildTestBundle } from './helpers/bundle.js';

const GOLDEN = path.join(import.meta.dirname, '__golden__', 'tool-wire');
const BASE = 'https://docs.example.com';
const ENDPOINT = `${BASE}/mcp`;

const LEGACY_VERSION = '2025-06-18';
const MODERN_VERSION = '2026-07-28';
const CLIENT_INFO = { name: 'wire-golden', version: '1.0.0' };

const LONG_FILLER = Array.from(
  { length: 12 },
  (_, i) => `Paragraph ${i + 1} describes ordinary widget behavior in some detail.`
).join('\n\n');

const docs: ProcessedDoc[] = [
  {
    route: '/docs/install',
    title: 'Installation',
    description: 'Install the widget toolkit',
    markdown:
      '# Installation\n\nRun npm install to install the widget toolkit.\n\n' +
      '## Requirements\n\nNode 22 or later.\n\n### Optional tools\n\nA widget linter.\n\n' +
      '#### Deep detail\n\nNot listed in the contents.',
    headings: [
      { level: 1, text: 'Installation', id: 'installation', startOffset: 0, endOffset: 64 },
      { level: 2, text: 'Requirements', id: 'requirements', startOffset: 64, endOffset: 100 },
      { level: 3, text: 'Optional tools', id: 'optional-tools', startOffset: 100, endOffset: 136 },
      { level: 4, text: 'Deep detail', id: 'deep-detail', startOffset: 136, endOffset: 180 },
    ],
  },
  {
    route: '/docs/faq',
    title: 'FAQ',
    description: '',
    markdown: 'Common questions about the widget toolkit, answered briefly.',
    headings: [],
  },
  {
    route: '/docs/guides/configuration',
    title: 'Configuration Guide',
    description: 'Every configuration option',
    markdown:
      `# Configuration Guide\n\n${LONG_FILLER}\n\n` +
      'The frobnicate option turns on frobnication for every widget.\n\n' +
      LONG_FILLER,
    headings: [
      {
        level: 1,
        text: 'Configuration Guide',
        id: 'configuration-guide',
        startOffset: 0,
        endOffset: 2000,
      },
    ],
  },
];

/** A provider with none of the optional methods; results echo what it was asked. */
function bundleFetchProvider(): SearchProvider {
  return {
    name: 'echo',
    initialize: async () => {},
    isReady: () => true,
    search: async (query, options): Promise<SearchResult[]> =>
      query.includes('nothing')
        ? []
        : [
            {
              url: `${BASE}/docs/faq`,
              route: '/docs/faq',
              title: 'FAQ',
              score: 1,
              snippet: `echo query=${JSON.stringify(query)} limit=${String(options?.limit)}`,
            },
          ],
  };
}

/** A provider whose search and getDocument both throw. */
function throwingProvider(): SearchProvider {
  return {
    name: 'throwing',
    initialize: async () => {},
    isReady: () => true,
    search: async () => {
      throw new Error('search exploded');
    },
    getDocument: async () => {
      throw new Error('getDocument exploded');
    },
  };
}

/** A provider that initializes but then reports not ready; no getDocument. */
function notReadyProvider(): SearchProvider {
  return {
    name: 'not-ready',
    initialize: async () => {},
    isReady: () => false,
    search: async () => [],
  };
}

const descriptionOverrides: McpServerToolsConfig = {
  docs_search: { description: 'Custom search description' },
  docs_fetch: { description: 'Custom fetch description' },
};

interface Scenario {
  name: string;
  server: (artifacts: ArtifactBundle) => McpDocsServer;
}

const SCENARIOS: Scenario[] = [
  { name: 'defaults', server: (artifacts) => new McpDocsServer({ artifacts }) },
  {
    name: 'description-overrides',
    server: (artifacts) => new McpDocsServer({ artifacts, tools: descriptionOverrides }),
  },
  {
    name: 'provider-throws',
    server: (artifacts) => new McpDocsServer({ artifacts, search: throwingProvider() }),
  },
  {
    name: 'provider-not-ready',
    server: (artifacts) => new McpDocsServer({ artifacts, search: notReadyProvider() }),
  },
  {
    name: 'provider-without-getdocument',
    server: (artifacts) => new McpDocsServer({ artifacts, search: bundleFetchProvider() }),
  },
];

interface Call {
  label: string;
  method: string;
  params: Record<string, unknown>;
}

function toolCall(label: string, name: string, args?: Record<string, unknown>): Call {
  return {
    label,
    method: 'tools/call',
    params: args === undefined ? { name } : { name, arguments: args },
  };
}

const CALLS: Call[] = [
  { label: 'tools/list', method: 'tools/list', params: {} },
  toolCall('docs_search: hit', 'docs_search', { query: 'widget' }),
  toolCall('docs_search: limit 1', 'docs_search', { query: 'widget', limit: 1 }),
  toolCall('docs_search: long page snippet', 'docs_search', { query: 'frobnicate' }),
  toolCall('docs_search: miss', 'docs_search', { query: 'nothingmatcheszzz' }),
  toolCall('docs_search: empty query', 'docs_search', { query: '' }),
  toolCall('docs_search: limit 21 (over max)', 'docs_search', { query: 'widget', limit: 21 }),
  toolCall('docs_search: missing query', 'docs_search', {}),
  toolCall('docs_search: no arguments', 'docs_search'),
  toolCall('docs_fetch: hit (headings)', 'docs_fetch', { url: `${BASE}/docs/install` }),
  toolCall('docs_fetch: page without headings', 'docs_fetch', { url: `${BASE}/docs/faq` }),
  toolCall('docs_fetch: not found', 'docs_fetch', { url: `${BASE}/docs/missing` }),
  toolCall('docs_fetch: invalid url', 'docs_fetch', { url: 'not a url' }),
  toolCall('docs_fetch: missing url', 'docs_fetch', {}),
  toolCall('docs_fetch: no arguments', 'docs_fetch'),
  toolCall('unknown tool', 'docs_nope', { query: 'widget' }),
];

interface Exchange {
  label: string;
  status: number;
  contentType: string | null;
  body: unknown;
  consoleErrors?: string[];
}

let consoleErrors: string[] = [];

beforeAll(() => {
  // Indexer progress logs are expected; keep test output readable.
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
    consoleErrors.push(
      args.map((a) => (a instanceof Error ? `${a.name}: ${a.message}` : String(a))).join(' ')
    );
  });
});

afterAll(() => {
  vi.restoreAllMocks();
});

async function send(
  server: McpDocsServer,
  label: string,
  headers: Record<string, string>,
  body: unknown
): Promise<Exchange> {
  consoleErrors = [];
  const response = await server.handleWebRequest(
    new Request(ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
        ...headers,
      },
      body: JSON.stringify(body),
    })
  );
  const text = await response.text();
  let parsed: unknown = text === '' ? null : text;
  try {
    parsed = text === '' ? null : JSON.parse(text);
  } catch {
    // Not JSON: keep the raw text so the snapshot shows it.
  }
  return {
    label,
    status: response.status,
    contentType: response.headers.get('content-type'),
    body: parsed,
    ...(consoleErrors.length ? { consoleErrors: [...consoleErrors] } : {}),
  };
}

/** 2025-era: initialize handshake, then plain requests with the version header. */
async function runLegacy(server: McpDocsServer): Promise<Exchange[]> {
  const exchanges: Exchange[] = [];
  let id = 0;
  exchanges.push(
    await send(
      server,
      'initialize',
      {},
      {
        jsonrpc: '2.0',
        id: id++,
        method: 'initialize',
        params: { protocolVersion: LEGACY_VERSION, capabilities: {}, clientInfo: CLIENT_INFO },
      }
    )
  );
  const versionHeader = { 'MCP-Protocol-Version': LEGACY_VERSION };
  exchanges.push(
    await send(server, 'notifications/initialized', versionHeader, {
      jsonrpc: '2.0',
      method: 'notifications/initialized',
    })
  );
  for (const call of CALLS) {
    exchanges.push(
      await send(server, call.label, versionHeader, {
        jsonrpc: '2.0',
        id: id++,
        method: call.method,
        params: call.params,
      })
    );
  }
  return exchanges;
}

/** 2026-07-28: stateless, per-request _meta envelope and routing headers. */
async function runModern(server: McpDocsServer): Promise<Exchange[]> {
  const exchanges: Exchange[] = [];
  let id = 0;
  for (const call of CALLS) {
    const name = typeof call.params.name === 'string' ? call.params.name : undefined;
    exchanges.push(
      await send(
        server,
        call.label,
        {
          'MCP-Protocol-Version': MODERN_VERSION,
          'Mcp-Method': call.method,
          ...(name ? { 'Mcp-Name': name } : {}),
        },
        {
          jsonrpc: '2.0',
          id: id++,
          method: call.method,
          params: {
            ...call.params,
            _meta: {
              'io.modelcontextprotocol/protocolVersion': MODERN_VERSION,
              'io.modelcontextprotocol/clientInfo': CLIENT_INFO,
              'io.modelcontextprotocol/clientCapabilities': {},
            },
          },
        }
      )
    );
  }
  return exchanges;
}

const ERAS = [
  { era: LEGACY_VERSION, run: runLegacy },
  { era: MODERN_VERSION, run: runModern },
];

async function golden(value: unknown, file: string): Promise<string> {
  const config = (await prettier.resolveConfig(file)) ?? {};
  return prettier.format(JSON.stringify(value, null, 2), { ...config, filepath: file });
}

describe.each(ERAS)('tool wire golden: $era', ({ era, run }) => {
  let artifacts: ArtifactBundle;

  beforeAll(async () => {
    artifacts = await buildTestBundle(docs, {
      name: 'wire-docs',
      version: '3.1.4',
      baseUrl: BASE,
    });
  });

  it.each(SCENARIOS)('$name', async ({ name, server }) => {
    const file = path.join(GOLDEN, era, `${name}.json`);
    const exchanges = await run(server(artifacts));
    await expect(await golden(exchanges, file)).toMatchFileSnapshot(file);
  });
});
