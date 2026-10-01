/**
 * A search provider can be just a SearchRanker (`{ name, search }`) since
 * 2.2. Drives one end to end, in both protocol eras, through
 * `createWebRequestHandler` and `McpDocsServer`: the tools list, `docs_search`
 * answers from the ranker, and `docs_fetch` and the status document count come
 * from the bundle.
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { McpDocsServer } from '../src/mcp/server.js';
import { loadSearchProvider } from '../src/providers/loader.js';
import { createWebRequestHandler } from '../src/adapters/web-request.js';
import type { ProcessedDoc, SearchResult } from '../src/types/index.js';
import type {
  ProviderContext,
  SearchOptions,
  SearchProviderInitData,
  SearchRanker,
} from '../src/providers/types.js';
import type { ArtifactBundle } from '../src/artifacts/bundle.js';
import { buildTestBundle } from './helpers/bundle.js';

const BASE = 'https://docs.example.com';
const ENDPOINT = `${BASE}/mcp`;
const LEGACY = '2025-06-18';
const MODERN = '2026-07-28';
const CLIENT_INFO = { name: 'ranker-test', version: '1.0.0' };
const NOT_READY = 'Server not initialized. Please try again.';

const docs: ProcessedDoc[] = [
  {
    route: '/docs/install',
    title: 'Installation',
    description: 'Install the widget toolkit',
    markdown: '# Installation\n\nRun npm install to install the widget toolkit.',
    headings: [
      { level: 1, text: 'Installation', id: 'installation', startOffset: 0, endOffset: 14 },
    ],
  },
  {
    route: '/docs/faq',
    title: 'FAQ',
    description: '',
    markdown: 'Common questions about the widget toolkit.',
    headings: [],
  },
];

type Era = typeof LEGACY | typeof MODERN;
type Fetch = (request: Request) => Promise<Response>;

interface RpcResult {
  content?: Array<{ type: string; text: string }>;
  isError?: boolean;
  tools?: Array<{ name: string }>;
}

/** POST one JSON-RPC request in the given era (2025-era after an initialize handshake). */
async function rpc(
  fetch: Fetch,
  era: Era,
  method: string,
  params: Record<string, unknown>
): Promise<RpcResult> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json, text/event-stream',
    'MCP-Protocol-Version': era,
  };
  let body: Record<string, unknown>;
  if (era === MODERN) {
    headers['Mcp-Method'] = method;
    if (typeof params.name === 'string') headers['Mcp-Name'] = params.name;
    body = {
      jsonrpc: '2.0',
      id: 1,
      method,
      params: {
        ...params,
        _meta: {
          'io.modelcontextprotocol/protocolVersion': MODERN,
          'io.modelcontextprotocol/clientInfo': CLIENT_INFO,
          'io.modelcontextprotocol/clientCapabilities': {},
        },
      },
    };
  } else {
    // Stateless 2025-era server: a handshake first, as a client would.
    const init = await fetch(
      new Request(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: headers.Accept! },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 0,
          method: 'initialize',
          params: { protocolVersion: LEGACY, capabilities: {}, clientInfo: CLIENT_INFO },
        }),
      })
    );
    expect(init.status).toBe(200);
    body = { jsonrpc: '2.0', id: 1, method, params };
  }

  const response = await fetch(
    new Request(ENDPOINT, { method: 'POST', headers, body: JSON.stringify(body) })
  );
  expect(response.status).toBe(200);
  const json = (await response.json()) as { result?: RpcResult; error?: unknown };
  expect(json.error).toBeUndefined();
  return json.result ?? {};
}

const callTool = (fetch: Fetch, era: Era, name: string, args: Record<string, unknown>) =>
  rpc(fetch, era, 'tools/call', { name, arguments: args });

/** A ranker with nothing but `name` and `search`; it records its queries. */
function bareRanker() {
  const queries: Array<{ query: string; options?: SearchOptions }> = [];
  const ranker = {
    name: 'bare-ranker',
    search: async (query: string, options?: SearchOptions): Promise<SearchResult[]> => {
      queries.push({ query, options });
      return [
        {
          url: `${BASE}/docs/faq`,
          route: '/docs/faq',
          title: 'FAQ',
          score: 1,
          snippet: `ranked by bare-ranker for ${query}`,
        },
      ];
    },
  };
  return { ranker, queries };
}

let artifacts: ArtifactBundle;

beforeAll(async () => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
  // Round-trip through JSON, as a bundler import of bundle.json would.
  artifacts = JSON.parse(
    JSON.stringify(await buildTestBundle(docs, { name: 'ranker-docs', baseUrl: BASE }))
  );
});

afterAll(() => {
  vi.restoreAllMocks();
});

const ENTRY_POINTS = [
  {
    via: 'createWebRequestHandler',
    make(search: SearchRanker) {
      const handler = createWebRequestHandler({ artifacts, search });
      return {
        fetch: handler,
        status: async () => {
          const res = await handler(new Request(ENDPOINT, { method: 'GET' }));
          expect(res.status).toBe(200);
          return (await res.json()) as { docCount: number; searchProvider?: string };
        },
      };
    },
  },
  {
    via: 'McpDocsServer',
    make(search: SearchRanker) {
      const server = new McpDocsServer({ artifacts, search });
      return {
        fetch: (request: Request) => server.handleWebRequest(request),
        // As the GET status does: getStatus() itself does not initialize.
        status: async () => {
          await server.initialize();
          return server.getStatus();
        },
      };
    },
  },
];

describe.each(ENTRY_POINTS)('a { name, search } ranker via $via', ({ make }) => {
  describe.each([LEGACY, MODERN] as const)('%s', (era) => {
    it('lists both tools', async () => {
      const { fetch } = make(bareRanker().ranker);
      const { tools } = await rpc(fetch, era, 'tools/list', {});
      expect(tools?.map((t) => t.name)).toEqual(['docs_search', 'docs_fetch']);
    });

    it('answers docs_search from the ranker', async () => {
      const { ranker, queries } = bareRanker();
      const { fetch } = make(ranker);
      const result = await callTool(fetch, era, 'docs_search', { query: 'widget', limit: 3 });
      expect(result.isError).toBeUndefined();
      expect(result.content?.[0]?.text).toContain('ranked by bare-ranker for widget');
      expect(queries).toEqual([{ query: 'widget', options: { limit: 3 } }]);
    });

    it('serves docs_fetch from the bundle', async () => {
      const { fetch } = make(bareRanker().ranker);
      const result = await callTool(fetch, era, 'docs_fetch', { url: `${BASE}/docs/install` });
      expect(result.isError).toBeUndefined();
      expect(result.content?.[0]?.text).toContain('Run npm install to install the widget toolkit.');
    });

    it('reports the bundle document count in the status', async () => {
      const { fetch, status } = make(bareRanker().ranker);
      await rpc(fetch, era, 'tools/list', {});
      expect(await status()).toMatchObject({ docCount: 2, searchProvider: 'bare-ranker' });
    });
  });

  it('reports the status before any MCP request', async () => {
    const { status } = make(bareRanker().ranker);
    expect(await status()).toMatchObject({ docCount: 2, searchProvider: 'bare-ranker' });
  });
});

describe('a ranker with the optional members', () => {
  it('has initialize called once with the context and the bundle init data', async () => {
    const calls: Array<{ context: ProviderContext; initData?: SearchProviderInitData }> = [];
    const ranker: SearchRanker = {
      name: 'init-ranker',
      search: async () => [],
      async initialize(context, initData) {
        // Called as a method: `this` is the ranker.
        expect(this).toBe(ranker);
        calls.push({ context, initData });
      },
    };
    const server = new McpDocsServer({ artifacts, search: ranker });
    await server.initialize();
    await server.initialize();

    expect(calls).toHaveLength(1);
    expect(calls[0]?.context).toMatchObject({ baseUrl: BASE, serverName: 'ranker-docs' });
    expect(calls[0]?.initData?.bundle?.docs).toEqual(artifacts.docs);
    expect(calls[0]?.initData?.docs).toEqual(artifacts.docs);
    expect(calls[0]?.initData?.indexData).toEqual(artifacts.searchIndex);
  });

  it('fails initialization when initialize rejects', async () => {
    const ranker: SearchRanker = {
      name: 'failing-ranker',
      search: async () => [],
      initialize: async () => {
        throw new Error('no credentials');
      },
    };
    const server = new McpDocsServer({ artifacts, search: ranker });
    await expect(server.initialize()).rejects.toThrow('no credentials');
  });

  describe.each([LEGACY, MODERN] as const)('isReady() false, %s', (era) => {
    it('still gets the 2.x not-ready guard, as in the wire golden', async () => {
      const search = vi.fn(async () => []);
      const ranker: SearchRanker = { name: 'not-ready', search, isReady: () => false };
      const server = new McpDocsServer({ artifacts, search: ranker });
      const fetch = (request: Request) => server.handleWebRequest(request);

      const golden = JSON.parse(
        await fs.readFile(
          path.join(import.meta.dirname, '__golden__', 'tool-wire', era, 'provider-not-ready.json'),
          'utf8'
        )
      ) as Array<{ label: string; body: { result: RpcResult } }>;
      const expected = (label: string) => {
        const { content, isError } = golden.find((e) => e.label === label)!.body.result;
        return { content, isError };
      };

      const searched = await callTool(fetch, era, 'docs_search', { query: 'widget' });
      expect({ content: searched.content, isError: searched.isError }).toEqual(
        expected('docs_search: hit')
      );
      expect(searched.content?.[0]?.text).toBe(NOT_READY);

      const fetched = await callTool(fetch, era, 'docs_fetch', { url: `${BASE}/docs/install` });
      expect({ content: fetched.content, isError: fetched.isError }).toEqual(
        expected('docs_fetch: hit (headings)')
      );
      expect(search).not.toHaveBeenCalled();
    });
  });
});

describe('a ranker given as a module path', () => {
  let dir: string;

  beforeAll(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'mcp-ranker-module-'));
    await fs.writeFile(
      path.join(dir, 'class-ranker.mjs'),
      'export default class { name = "class-ranker"; async search() { return []; } }\n'
    );
    await fs.writeFile(
      path.join(dir, 'object-ranker.mjs'),
      'export default { name: "object-ranker", search: async () => [] };\n'
    );
  });

  afterAll(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  it.each(['class-ranker', 'object-ranker'])(
    'the server accepts a %s module with only name and search',
    async (name) => {
      const server = new McpDocsServer({ artifacts, search: path.join(dir, `${name}.mjs`) });
      await server.initialize();
      expect(await server.getStatus()).toMatchObject({
        initialized: true,
        searchProvider: name,
        docCount: docs.length,
      });
    }
  );

  it('loadSearchProvider still requires a full SearchProvider from a module path', async () => {
    await expect(loadSearchProvider(path.join(dir, 'class-ranker.mjs'))).rejects.toThrow(
      /does not implement SearchProvider interface/
    );
  });
});
