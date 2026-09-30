/**
 * The HTTP policy both adapters apply: preflight, GET status, 405, CORS, and
 * error mapping. Each case runs against the web handler and a real Node
 * server, and pins status, reason phrase, headers, and body.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createServer, type Server } from 'node:http';
import net from 'node:net';
import { createWebRequestHandler } from '../src/adapters/web-request.js';
import {
  createNodeHandler,
  createNodeServer,
  type NodeAdapterOptions,
} from '../src/adapters/node.js';
import { CORS_HEADERS } from '../src/adapters/cors.js';
import type { ArtifactBundle } from '../src/artifacts/bundle.js';
import type { SearchProvider } from '../src/providers/types.js';
import { buildTestBundle } from './helpers/bundle.js';

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
const METHOD_NOT_ALLOWED = {
  jsonrpc: '2.0',
  id: null,
  error: {
    code: -32600,
    message: 'Method not allowed. Use POST for MCP requests, GET for status.',
  },
};

const ORIGIN = 'https://docs.example.com';
const corsFor = (origin: string) => ({
  'access-control-allow-origin': origin,
  'access-control-allow-methods': CORS_HEADERS['Access-Control-Allow-Methods'],
  'access-control-allow-headers': CORS_HEADERS['Access-Control-Allow-Headers'],
  'access-control-expose-headers': CORS_HEADERS['Access-Control-Expose-Headers'],
});

interface Observed {
  status: number;
  headers: Record<string, string>;
  text: string;
}

async function observe(res: Response): Promise<Observed> {
  const headers: Record<string, string> = {};
  res.headers.forEach((value, key) => {
    if (key.startsWith('access-control-') || key === 'content-type') headers[key] = value;
  });
  return { status: res.status, headers, text: await res.text() };
}

type Send = (init: RequestInit) => Promise<Observed>;

async function listen(server: Server): Promise<string> {
  await new Promise<void>((resolve) => server.listen(0, resolve));
  closers.push(() => new Promise<void>((resolve) => server.close(() => resolve())));
  const addr = server.address();
  return `http://127.0.0.1:${typeof addr === 'object' && addr ? addr.port : 0}/mcp`;
}

/** Send raw bytes, for requests fetch refuses to make. */
function rawRequest(port: string, request: string): Promise<string> {
  return new Promise((resolve, reject) => {
    // Write, don't end: a half-closed socket gets no response. The request
    // says Connection: close, so the server ends the socket after replying.
    const socket = net.connect(Number(port), '127.0.0.1', () => socket.write(request));
    let response = '';
    socket.setEncoding('utf8');
    socket.on('data', (chunk: string) => (response += chunk));
    socket.on('end', () => resolve(response));
    socket.on('error', reject);
  });
}

async function startNode(
  options: NodeAdapterOptions
): Promise<{ send: Send; close: () => Promise<void> }> {
  const server: Server = createNodeServer(options);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const addr = server.address();
  const url = `http://127.0.0.1:${typeof addr === 'object' && addr ? addr.port : 0}/mcp`;
  return {
    send: async (init) => {
      const res = await fetch(url, init);
      // Node reports the standard reason phrase; pin it too.
      const observed = await observe(res);
      expect(res.statusText).not.toBe('');
      return observed;
    },
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

function webSender(config: Parameters<typeof createWebRequestHandler>[0]): Send {
  const handler = createWebRequestHandler(config);
  return async (init) => observe(await handler(new Request('https://x/mcp', init)));
}

const throwingProvider = (): SearchProvider => ({
  name: 'broken',
  initialize: async () => {
    throw new Error('secret connection string postgres://user:pw@db');
  },
  isReady: () => false,
  search: async () => [],
});

let bundle: ArtifactBundle;
let staleBundle: ArtifactBundle;
let dir: string;
let staleDir: string;
const closers: Array<() => Promise<void>> = [];

beforeAll(async () => {
  bundle = await buildTestBundle(
    [{ route: '/docs/x', title: 'X', description: 'x', markdown: '# X\n\nbody', headings: [] }],
    { name: 't' }
  );
  staleBundle = { ...bundle, searchIndex: { reg: '{}', 'content.map': '[]' } };

  const { writeArtifactBundle } = await import('../src/artifacts/node.js');
  dir = await fs.mkdtemp(path.join(os.tmpdir(), 'mcp-policy-'));
  staleDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mcp-policy-stale-'));
  await writeArtifactBundle(dir, bundle);
  await writeArtifactBundle(staleDir, staleBundle);
});

afterAll(async () => {
  await Promise.all(closers.map((close) => close()));
  await fs.rm(dir, { recursive: true, force: true });
  await fs.rm(staleDir, { recursive: true, force: true });
});

/** The same deployment behind each adapter. */
async function adapters(
  kind: 'healthy' | 'stale' | 'throwing',
  corsOrigin?: string
): Promise<Array<[string, Send]>> {
  const web = webSender({
    artifacts: kind === 'stale' ? staleBundle : bundle,
    ...(kind === 'throwing' ? { search: throwingProvider() } : {}),
    ...(corsOrigin ? { corsOrigin } : {}),
  });
  const node = await startNode({
    artifactsDir: kind === 'stale' ? staleDir : dir,
    ...(kind === 'throwing' ? { search: throwingProvider() } : {}),
    ...(corsOrigin ? { corsOrigin } : {}),
  });
  closers.push(node.close);
  return [
    ['web', web],
    ['node', node.send],
  ];
}

describe('shared HTTP policy', () => {
  it('OPTIONS → 204 with every CORS header and no body', async () => {
    for (const [name, send] of await adapters('healthy', ORIGIN)) {
      expect({ name, ...(await send({ method: 'OPTIONS' })) }).toEqual({
        name,
        status: 204,
        headers: corsFor(ORIGIN),
        text: '',
      });
    }
  });

  it("CORS origin defaults to '*'", async () => {
    for (const [, send] of await adapters('healthy')) {
      const res = await send({ method: 'OPTIONS' });
      expect(res.headers).toEqual(corsFor('*'));
    }
  });

  it('GET → 200 status JSON', async () => {
    for (const [name, send] of await adapters('healthy', ORIGIN)) {
      const res = await send({ method: 'GET' });
      expect(res.status, name).toBe(200);
      expect(res.headers, name).toEqual({ ...corsFor(ORIGIN), 'content-type': 'application/json' });
      expect(JSON.parse(res.text), name).toMatchObject({
        name: 't',
        initialized: true,
        docCount: 1,
      });
    }
  });

  it('GET status is compact on the web and pretty-printed by the Node server', async () => {
    const byName = Object.fromEntries(await adapters('healthy'));
    const webText = (await byName.web!({ method: 'GET' })).text;
    const nodeText = (await byName.node!({ method: 'GET' })).text;
    expect(webText).toBe(JSON.stringify(JSON.parse(webText)));
    expect(nodeText).toBe(JSON.stringify(JSON.parse(nodeText), null, 2));
  });

  it('GET with a broken deployment → 500 with the fix', async () => {
    for (const [name, send] of await adapters('stale', ORIGIN)) {
      const res = await send({ method: 'GET' });
      expect(res.status, name).toBe(500);
      expect(res.headers, name).toEqual({ ...corsFor(ORIGIN), 'content-type': 'application/json' });
      expect(JSON.parse(res.text).error, name).toMatch(/Rebuild the site/);
    }
  });

  it('GET with an unexpected error → 500 without leaking it', async () => {
    for (const [name, send] of await adapters('throwing')) {
      const res = await send({ method: 'GET' });
      expect({ name, status: res.status, body: JSON.parse(res.text) }).toEqual({
        name,
        status: 500,
        body: { error: 'Internal server error' },
      });
    }
  });

  it.each(['PUT', 'DELETE', 'PATCH'])('%s → 405 JSON-RPC error', async (method) => {
    for (const [name, send] of await adapters('healthy', ORIGIN)) {
      const res = await send({ method });
      expect({
        name,
        status: res.status,
        headers: res.headers,
        body: JSON.parse(res.text),
      }).toEqual({
        name,
        status: 405,
        headers: { ...corsFor(ORIGIN), 'content-type': 'application/json' },
        body: METHOD_NOT_ALLOWED,
      });
    }
  });

  it('HEAD → 405', async () => {
    // (Runtimes drop the body of a HEAD response.)
    for (const [name, send] of await adapters('healthy')) {
      expect((await send({ method: 'HEAD' })).status, name).toBe(405);
    }
  });

  it('POST initialize → 200 with CORS', async () => {
    for (const [name, send] of await adapters('healthy', ORIGIN)) {
      const res = await send({ method: 'POST', headers: MCP_HEADERS, body: INIT_BODY });
      expect(res.status, name).toBe(200);
      expect(res.headers, name).toEqual({ ...corsFor(ORIGIN), 'content-type': 'application/json' });
      expect(JSON.parse(res.text).result.serverInfo.name, name).toBe('t');
    }
  });

  it('POST with a broken deployment → 500 JSON-RPC error with the fix', async () => {
    for (const [name, send] of await adapters('stale', ORIGIN)) {
      const res = await send({ method: 'POST', headers: MCP_HEADERS, body: INIT_BODY });
      const body = JSON.parse(res.text);
      expect(res.status, name).toBe(500);
      expect(res.headers, name).toEqual({ ...corsFor(ORIGIN), 'content-type': 'application/json' });
      expect(body, name).toMatchObject({ jsonrpc: '2.0', id: null, error: { code: -32603 } });
      expect(body.error.message, name).toMatch(/Rebuild the site/);
    }
  });

  it('POST with an unexpected error → 500 without leaking it', async () => {
    for (const [name, send] of await adapters('throwing')) {
      const res = await send({ method: 'POST', headers: MCP_HEADERS, body: INIT_BODY });
      expect({ name, status: res.status, body: JSON.parse(res.text) }).toEqual({
        name,
        status: 500,
        body: {
          jsonrpc: '2.0',
          id: null,
          error: { code: -32603, message: 'Internal server error' },
        },
      });
    }
  });
});

describe('Node server only', () => {
  let send: Send;

  beforeAll(async () => {
    const node = await startNode({ artifactsDir: dir, corsOrigin: ORIGIN });
    closers.push(node.close);
    send = node.send;
  });

  it('body over 1MB → 413 JSON-RPC error with CORS', async () => {
    const res = await send({
      method: 'POST',
      headers: MCP_HEADERS,
      body: 'x'.repeat(1024 * 1024 + 16),
    });
    expect({ status: res.status, headers: res.headers, body: JSON.parse(res.text) }).toEqual({
      status: 413,
      headers: { ...corsFor(ORIGIN), 'content-type': 'application/json' },
      body: {
        jsonrpc: '2.0',
        id: null,
        error: { code: -32600, message: 'Request body too large' },
      },
    });
  });

  it('invalid JSON → 400 parse error with CORS', async () => {
    const res = await send({ method: 'POST', headers: MCP_HEADERS, body: '{not json' });
    expect({ status: res.status, headers: res.headers, body: JSON.parse(res.text) }).toEqual({
      status: 400,
      headers: { ...corsFor(ORIGIN), 'content-type': 'application/json' },
      body: {
        jsonrpc: '2.0',
        id: null,
        error: { code: -32700, message: 'Parse error: invalid JSON in request body' },
      },
    });
  });

  it('checks the body before loading the bundle', async () => {
    const missing = await startNode({ artifactsDir: path.join(dir, 'nope') });
    closers.push(missing.close);
    const res = await missing.send({ method: 'POST', headers: MCP_HEADERS, body: '{not json' });
    expect(res.status).toBe(400);
  });

  it('does not read the body of a non-POST request', async () => {
    const handler = createNodeHandler({ artifactsDir: dir });
    const server = createServer((req, res) => {
      let read = 0;
      req.on('data', (chunk: Buffer) => (read += chunk.length));
      req.pause();
      void handler(req, res).then(() => expect(read).toBe(0));
    });
    const url = await listen(server);
    const res = await fetch(url, { method: 'PUT', body: 'x'.repeat(64 * 1024) });
    expect(res.status).toBe(405);
  });

  it('serves a request with a malformed Host header', async () => {
    const handler = createNodeHandler({ artifactsDir: dir });
    const server = createServer(handler);
    const url = new URL(await listen(server));
    for (const [method, body] of [
      ['GET', ''],
      ['POST', INIT_BODY],
    ] as const) {
      const raw = await rawRequest(
        url.port,
        `${method} /mcp HTTP/1.1\r\nHost: bad host\r\nContent-Type: application/json\r\n` +
          `Accept: application/json, text/event-stream\r\nContent-Length: ${Buffer.byteLength(body)}\r\n` +
          `Connection: close\r\n\r\n${body}`
      );
      expect(raw.split('\r\n')[0]).toBe('HTTP/1.1 200 OK');
    }
  });

  describe('behind a body parser that has already read the request', () => {
    // What express.json(), express.text(), and express.raw() leave behind.
    function withParsedBody(parse: (text: string) => unknown) {
      const handler = createNodeHandler({ artifactsDir: dir, corsOrigin: ORIGIN });
      return createServer((req, res) => {
        let text = '';
        req.setEncoding('utf8');
        req.on('data', (chunk: string) => (text += chunk));
        req.on('end', () => {
          (req as typeof req & { body?: unknown }).body = parse(text);
          void handler(req, res);
        });
      });
    }

    it.each([
      ['a parsed object (express.json)', (text: string) => JSON.parse(text)],
      ['a string (express.text)', (text: string) => text],
      ['a Buffer (express.raw)', (text: string) => Buffer.from(text)],
    ])('uses %s', async (_label, parse) => {
      const url = await listen(withParsedBody(parse));
      const res = await fetch(url, { method: 'POST', headers: MCP_HEADERS, body: INIT_BODY });
      expect(res.status).toBe(200);
      expect(res.headers.get('access-control-allow-origin')).toBe(ORIGIN);
      expect((await res.json()).result.serverInfo.name).toBe('t');
    });

    it('still answers invalid JSON with a 400', async () => {
      const url = await listen(withParsedBody((text) => text));
      const res = await fetch(url, { method: 'POST', headers: MCP_HEADERS, body: '{not json' });
      expect(res.status).toBe(400);
    });

    it('treats a consumed stream with no body as empty instead of hanging', async () => {
      const url = await listen(withParsedBody(() => undefined));
      const res = await fetch(url, { method: 'POST', headers: MCP_HEADERS, body: INIT_BODY });
      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(res.status).toBeLessThan(500);
    });
  });

  it('corsOrigin: false sends no CORS headers on any response', async () => {
    const node = await startNode({ artifactsDir: dir, corsOrigin: false });
    closers.push(node.close);
    const responses = [
      await node.send({ method: 'OPTIONS' }),
      await node.send({ method: 'GET' }),
      await node.send({ method: 'PUT' }),
      await node.send({ method: 'POST', headers: MCP_HEADERS, body: INIT_BODY }),
      await node.send({ method: 'POST', headers: MCP_HEADERS, body: '{not json' }),
    ];
    for (const res of responses) {
      expect(Object.keys(res.headers).filter((key) => key.startsWith('access-control-'))).toEqual(
        []
      );
    }
  });
});
