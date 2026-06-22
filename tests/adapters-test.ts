import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { Server } from 'node:http';
import { createWebRequestHandler } from '../src/adapters/web-request.js';
import { createNodeServer } from '../src/adapters/node.js';
import { FlexSearchIndexer } from '../src/providers/indexers/flexsearch-indexer.js';
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
  const indexer = new FlexSearchIndexer();
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

    server = createNodeServer({
      name: 't',
      baseUrl: 'https://example.com',
      docsPath: path.join(dir, 'docs.json'),
      indexPath: path.join(dir, 'search-index.json'),
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

  it('POST initialize → 200', async () => {
    const res = await fetch(baseURL, { method: 'POST', headers: MCP_HEADERS, body: INIT_BODY });
    expect(res.status).toBe(200);
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
