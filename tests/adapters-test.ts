import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { Server } from 'node:http';
import { createWebRequestHandler } from '../src/adapters/web-request.js';
import { createNodeServer } from '../src/adapters/node.js';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { LocalSearchIndexer } from '../src/providers/indexers/local-search-indexer.js';
import { buildSkillsArtifact } from '../src/skills/packager.js';
import type { ProcessedDoc } from '../src/types/index.js';
import type { ProviderContext } from '../src/providers/types.js';

const mockDocs: ProcessedDoc[] = [
  { route: '/docs/x', title: 'X', description: 'doc x', markdown: '# X\n\nbody', headings: [] },
];
const ctx: ProviderContext = {
  baseUrl: 'https://example.com',
  serverName: 't',
  serverVersion: '1.0.0',
  outputDir: '/tmp',
};

async function buildArtifacts() {
  const indexer = new LocalSearchIndexer();
  await indexer.initialize(ctx);
  await indexer.indexDocuments(mockDocs);
  return indexer.finalize();
}

const MCP_HEADERS = {
  'Content-Type': 'application/json',
  Accept: 'application/json, text/event-stream',
};
const INIT_BODY = JSON.stringify({
  jsonrpc: '2.0',
  id: 1,
  method: 'initialize',
  params: {
    protocolVersion: '2025-06-18',
    capabilities: {},
    clientInfo: { name: 't', version: '1.0.0' },
  },
});

describe('createWebRequestHandler (web/edge, data mode)', () => {
  let handler: (req: Request) => Promise<Response>;

  beforeAll(async () => {
    const a = await buildArtifacts();
    handler = createWebRequestHandler({
      name: 't',
      baseUrl: 'https://example.com',
      docs: a.get('docs.json') as Record<string, ProcessedDoc>,
      searchIndexData: a.get('search-index.json') as Record<string, unknown>,
      corsOrigin: 'https://docs.example.com',
    });
  });

  it('OPTIONS preflight → 204 with the configured CORS origin', async () => {
    const res = await handler(new Request('https://x/mcp', { method: 'OPTIONS' }));
    expect(res.status).toBe(204);
    expect(res.headers.get('access-control-allow-origin')).toBe('https://docs.example.com');
  });

  it('preflight allows the 2026-07-28 routing headers', async () => {
    const res = await handler(new Request('https://x/mcp', { method: 'OPTIONS' }));
    const allowed = res.headers.get('access-control-allow-headers') ?? '';
    for (const header of ['MCP-Protocol-Version', 'Mcp-Method', 'Mcp-Name']) {
      expect(allowed).toContain(header);
    }
  });

  it('GET → 200 status JSON', async () => {
    const res = await handler(new Request('https://x/mcp', { method: 'GET' }));
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('application/json');
  });

  it('non-POST (PUT) → 405', async () => {
    const res = await handler(new Request('https://x/mcp', { method: 'PUT' }));
    expect(res.status).toBe(405);
  });

  it('POST initialize → 200', async () => {
    const res = await handler(
      new Request('https://x/mcp', { method: 'POST', headers: MCP_HEADERS, body: INIT_BODY })
    );
    expect(res.status).toBe(200);
  });
});

describe('a deployment with a stale 1.x search-index.json', () => {
  // 1.x wrote a FlexSearch export; 2.0 rejects it. The site owner must see
  // why (and how to fix it) from a request, not only in server logs.
  const staleIndex = { reg: '{}', 'content.map': '[]' };
  let handler: (req: Request) => Promise<Response>;

  beforeAll(async () => {
    const a = await buildArtifacts();
    handler = createWebRequestHandler({
      name: 't',
      docs: a.get('docs.json') as Record<string, ProcessedDoc>,
      searchIndexData: staleIndex,
    });
  });

  it('POST returns the rebuild instruction in the JSON-RPC error', async () => {
    const res = await handler(
      new Request('https://x/mcp', { method: 'POST', headers: MCP_HEADERS, body: INIT_BODY })
    );
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error.code).toBe(-32603);
    expect(body.error.message).toMatch(/Rebuild the site/);
    expect(body.error.message).toMatch(/migrations\/1\.x-2\.0\.0\.md/);
  });

  it('GET status reports the same error instead of looking healthy', async () => {
    const res = await handler(new Request('https://x/mcp', { method: 'GET' }));
    expect(res.status).toBe(500);
    expect((await res.json()).error).toMatch(/Rebuild the site/);
  });
});

describe('unexpected errors stay generic on the wire', () => {
  it('does not leak the message of a non-configuration error', async () => {
    const handler = createWebRequestHandler({
      name: 't',
      docs: {},
      searchIndexData: {},
      search: {
        name: 'broken',
        initialize: async () => {
          throw new Error('secret connection string postgres://user:pw@db');
        },
        isReady: () => false,
        search: async () => [],
        getDocument: async () => null,
      },
    });
    const res = await handler(
      new Request('https://x/mcp', { method: 'POST', headers: MCP_HEADERS, body: INIT_BODY })
    );
    const body = await res.json();
    expect(body.error.message).toBe('Internal server error');

    const status = await handler(new Request('https://x/mcp', { method: 'GET' }));
    expect((await status.json()).error).toBe('Internal server error');
  });
});

describe('createNodeServer (local dev, file mode)', () => {
  let server: Server;
  let baseURL: string;
  let dir: string;

  beforeAll(async () => {
    const a = await buildArtifacts();
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'mcp-adapter-'));
    await fs.writeFile(path.join(dir, 'docs.json'), JSON.stringify(a.get('docs.json')));
    await fs.writeFile(
      path.join(dir, 'search-index.json'),
      JSON.stringify(a.get('search-index.json'))
    );
    const skills = await buildSkillsArtifact({ builtin: true, siteTitle: 'T' });
    await fs.writeFile(path.join(dir, 'skills.json'), JSON.stringify(skills));

    server = createNodeServer({
      name: 't',
      baseUrl: 'https://example.com',
      docsPath: path.join(dir, 'docs.json'),
      indexPath: path.join(dir, 'search-index.json'),
      skillsPath: path.join(dir, 'skills.json'),
      corsOrigin: 'https://docs.example.com',
    });
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const addr = server.address();
    const port = typeof addr === 'object' && addr ? addr.port : 0;
    baseURL = `http://127.0.0.1:${port}/mcp`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await fs.rm(dir, { recursive: true, force: true });
  });

  it('OPTIONS → 204 with the configured CORS origin', async () => {
    const res = await fetch(baseURL, { method: 'OPTIONS' });
    expect(res.status).toBe(204);
    expect(res.headers.get('access-control-allow-origin')).toBe('https://docs.example.com');
  });

  it('GET → 200', async () => {
    const res = await fetch(baseURL);
    expect(res.status).toBe(200);
  });

  it('non-POST (PUT) → 405', async () => {
    const res = await fetch(baseURL, { method: 'PUT' });
    expect(res.status).toBe(405);
  });

  it('POST initialize → 200 JSON (2025-era clients keep plain JSON responses)', async () => {
    const res = await fetch(baseURL, { method: 'POST', headers: MCP_HEADERS, body: INIT_BODY });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('application/json');
  });

  it('serves a 2026-07-28 client end to end, including skills', async () => {
    const client = new Client(
      { name: 'node-test', version: '1.0.0' },
      { versionNegotiation: { mode: { pin: '2026-07-28' } } }
    );
    await client.connect(new StreamableHTTPClientTransport(new URL(baseURL)));

    const { tools } = await client.listTools();
    expect(tools).toHaveLength(2);

    const { resources } = await client.listResources();
    expect(resources.map((r) => r.uri)).toContain('skill://docs-research/SKILL.md');

    const read = await client.readResource({ uri: 'skill://docs-research/SKILL.md' });
    expect((read.contents[0] as { text: string }).text).toContain('name: docs-research');

    await client.close();
  });

  it('body over 1MB → 413', async () => {
    const res = await fetch(baseURL, {
      method: 'POST',
      headers: MCP_HEADERS,
      body: 'x'.repeat(1024 * 1024 + 16),
    });
    expect(res.status).toBe(413);
  });

  it('invalid JSON → 400 parse error', async () => {
    const res = await fetch(baseURL, { method: 'POST', headers: MCP_HEADERS, body: '{not json' });
    expect(res.status).toBe(400);
  });
});
