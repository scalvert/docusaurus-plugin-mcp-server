/**
 * Node <-> web bridge used by McpDocsServer.handleHttpRequest.
 *
 * The shipped Node adapter always pre-parses the body, so these tests cover
 * the paths it never takes: streaming a raw request body (callers mounting
 * handleHttpRequest in their own http server without a body parser),
 * repeated headers, stream errors, and response writing.
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { Readable } from 'node:stream';
import http, { type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { toWebRequest, writeWebResponse } from '../src/adapters/node-bridge.js';
import { McpDocsServer } from '../src/mcp/server.js';
import type { ProcessedDoc } from '../src/types/index.js';
import { buildTestBundle } from './helpers/bundle.js';

/** A fake IncomingMessage: a readable stream plus request metadata. */
function fakeRequest(
  init: {
    method?: string;
    url?: string;
    headers?: IncomingMessage['headers'];
    chunks?: Array<string | Buffer>;
    error?: Error;
  } = {}
): IncomingMessage {
  const chunks = init.chunks ?? [];
  const stream = new Readable({
    read() {
      const next = chunks.shift();
      if (next !== undefined) {
        this.push(next);
      } else if (init.error) {
        this.destroy(init.error);
      } else {
        this.push(null);
      }
    },
  });
  return Object.assign(stream, {
    method: init.method ?? 'POST',
    url: init.url ?? '/mcp',
    headers: { host: 'docs.example.com', ...init.headers },
  }) as unknown as IncomingMessage;
}

/** A fake ServerResponse that records what was written. */
function fakeResponse() {
  const headers: Record<string, string | number | readonly string[]> = {};
  const names: string[] = [];
  const written: Buffer[] = [];
  const state = { status: 0, statusText: '', ended: false, writes: 0 };
  const destroyed: { error?: Error; called: boolean } = { called: false };
  const res = {
    destroy: (error?: Error) => {
      destroyed.called = true;
      destroyed.error = error;
    },
    setHeader: (k: string, v: string | number | readonly string[]) => {
      names.push(k);
      headers[k.toLowerCase()] = v;
    },
    writeHead: (status: number, statusText?: string) => {
      state.status = status;
      state.statusText = statusText ?? '';
    },
    write: (chunk: Uint8Array) => {
      state.writes++;
      written.push(Buffer.from(chunk));
      return true;
    },
    end: (chunk?: string | Uint8Array) => {
      if (chunk !== undefined) written.push(Buffer.from(chunk));
      state.ended = true;
    },
  } as unknown as ServerResponse;
  return {
    res,
    headers,
    names,
    state,
    destroyed,
    body: () => Buffer.concat(written).toString('utf8'),
  };
}

// Indexer and server progress logs are expected here; keep test output readable.
beforeAll(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
});
afterAll(() => {
  vi.restoreAllMocks();
});

describe('toWebRequest', () => {
  it('streams a raw body across multiple chunks, strings and buffers', async () => {
    const req = fakeRequest({
      headers: { 'content-type': 'application/json' },
      chunks: ['{"jsonrpc":"2.0",', Buffer.from('"id":1,'), '"method":"tools/list"}'],
    });

    const request = toWebRequest(req, undefined);

    expect(request.method).toBe('POST');
    expect(request.url).toBe('http://docs.example.com/mcp');
    expect(await request.json()).toEqual({ jsonrpc: '2.0', id: 1, method: 'tools/list' });
  });

  it('streams large bodies intact', async () => {
    const big = 'x'.repeat(256 * 1024);
    const req = fakeRequest({ chunks: [big.slice(0, 100_000), big.slice(100_000)] });
    expect(await toWebRequest(req, undefined).text()).toBe(big);
  });

  it('keeps every value of a repeated header', () => {
    const req = fakeRequest({
      method: 'GET',
      headers: { 'x-forwarded-for': ['10.0.0.1', '10.0.0.2'], accept: 'application/json' },
    });

    const request = toWebRequest(req, undefined);

    expect(request.headers.get('x-forwarded-for')).toBe('10.0.0.1, 10.0.0.2');
    expect(request.headers.get('accept')).toBe('application/json');
  });

  it('re-serializes a pre-parsed body and drops the stale content-length', async () => {
    const req = fakeRequest({ headers: { 'content-length': '999' } });

    const request = toWebRequest(req, { jsonrpc: '2.0', id: 7, method: 'ping' });

    expect(request.headers.get('content-length')).toBeNull();
    expect(await request.json()).toEqual({ jsonrpc: '2.0', id: 7, method: 'ping' });
  });

  it('sends no body for GET and HEAD', () => {
    expect(toWebRequest(fakeRequest({ method: 'GET' }), undefined).body).toBeNull();
    expect(toWebRequest(fakeRequest({ method: 'HEAD' }), undefined).body).toBeNull();
  });

  it('defaults a missing host and url', () => {
    const req = fakeRequest({ method: 'GET' });
    delete (req.headers as Record<string, unknown>).host;
    (req as { url?: string }).url = undefined;

    expect(toWebRequest(req, undefined).url).toBe('http://localhost/');
  });

  it('surfaces a request stream error to the body reader', async () => {
    const req = fakeRequest({ chunks: ['{"partial":'], error: new Error('socket reset') });
    await expect(toWebRequest(req, undefined).text()).rejects.toThrow();
  });
});

describe('writeWebResponse', () => {
  const twoChunks = (first: string, second: string) =>
    new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(first));
        controller.enqueue(new TextEncoder().encode(second));
        controller.close();
      },
    });

  it('copies status and headers, keeps headers already set on res, and streams the body', async () => {
    const { res, headers, state, body } = fakeResponse();
    res.setHeader('Access-Control-Allow-Origin', '*');

    await writeWebResponse(
      new Response(twoChunks('data: 1\n\n', 'data: 2\n\n'), {
        status: 200,
        statusText: 'OK',
        headers: { 'content-type': 'text/event-stream' },
      }),
      res
    );

    expect(state).toEqual({ status: 200, statusText: 'OK', ended: true, writes: 2 });
    expect(headers['access-control-allow-origin']).toBe('*');
    expect(headers['content-type']).toBe('text/event-stream');
    expect(body()).toBe('data: 1\n\ndata: 2\n\n');
  });

  it('writes a JSON body in one end(), with canonical header names', async () => {
    const { res, names, state, body } = fakeResponse();

    await writeWebResponse(
      new Response(twoChunks('{"a":', '1}'), {
        status: 200,
        headers: { 'content-type': 'application/json', 'mcp-protocol-version': '2026-07-28' },
      }),
      res
    );

    expect(state).toEqual({ status: 200, statusText: '', ended: true, writes: 0 });
    expect(names).toEqual(['Content-Type', 'Mcp-Protocol-Version', 'Content-Length']);
    expect(body()).toBe('{"a":1}');
  });

  it('sets Content-Length in bytes, and matches the JSON media type exactly', async () => {
    const json = fakeResponse();
    await writeWebResponse(
      new Response('{"s":"é"}', { headers: { 'content-type': 'Application/JSON; charset=utf-8' } }),
      json.res
    );
    expect(json.headers['content-length']).toBe(10);
    expect(json.state.writes).toBe(0);

    const seq = fakeResponse();
    await writeWebResponse(
      new Response('{"a":1}\n', { headers: { 'content-type': 'application/json-seq' } }),
      seq.res
    );
    expect(seq.headers).not.toHaveProperty('content-length');
    expect(seq.state.writes).toBe(1);
  });

  it('sends nothing when a JSON body fails to read, so the caller can answer', async () => {
    const { res, state } = fakeResponse();
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        controller.error(new Error('upstream failed'));
      },
    });
    await expect(
      writeWebResponse(
        new Response(stream, { headers: { 'content-type': 'application/json' } }),
        res
      )
    ).rejects.toThrow('upstream failed');
    expect(state).toEqual({ status: 0, statusText: '', ended: false, writes: 0 });
  });

  it('ends the response for bodiless statuses', async () => {
    const { res, state, body } = fakeResponse();
    await writeWebResponse(new Response(null, { status: 202 }), res);
    expect(state.status).toBe(202);
    expect(state.ended).toBe(true);
    expect(body()).toBe('');
  });

  it('destroys the response, rather than ending it cleanly, when a stream errors midway', async () => {
    const { res, state, destroyed } = fakeResponse();
    let sent = false;
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (!sent) {
          sent = true;
          controller.enqueue(new TextEncoder().encode('data: 1\n\n'));
        } else {
          controller.error(new Error('upstream failed'));
        }
      },
    });

    await expect(
      writeWebResponse(
        new Response(stream, { headers: { 'content-type': 'text/event-stream' } }),
        res
      )
    ).rejects.toThrow('upstream failed');
    expect(state).toMatchObject({ status: 200, writes: 1, ended: false });
    expect(destroyed).toEqual({ called: true, error: new Error('upstream failed') });
  });
});

describe('handleHttpRequest without a pre-parsed body', () => {
  let server: http.Server;
  let url: string;

  beforeAll(async () => {
    const docs: ProcessedDoc[] = [
      {
        route: '/docs/intro',
        title: 'Intro',
        description: '',
        markdown: '# Intro\n\nStreaming bodies work.',
        headings: [],
      },
    ];
    const mcp = new McpDocsServer({
      artifacts: await buildTestBundle(docs, {
        name: 'raw-body',
        baseUrl: 'https://docs.example.com',
      }),
    });

    // Mounted the way a user would in their own server: no body parsing.
    server = http.createServer((req, res) => {
      void mcp.handleHttpRequest(req, res);
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/mcp`;
  });

  afterAll(async () => {
    await new Promise((resolve) => server.close(resolve));
  });

  it('serves a 2025-era initialize from the raw stream as plain JSON', async () => {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2025-06-18',
          capabilities: {},
          clientInfo: { name: 'raw', version: '1' },
        },
      }),
    });

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('application/json');
    expect((await res.json()).result.serverInfo.name).toBe('raw-body');
  });

  it('serves a 2026-07-28 client end to end from the raw stream', async () => {
    const client = new Client(
      { name: 'raw-modern', version: '1.0.0' },
      { versionNegotiation: { mode: { pin: '2026-07-28' } } }
    );
    await client.connect(new StreamableHTTPClientTransport(new URL(url)));

    const result = await client.callTool({ name: 'docs_search', arguments: { query: 'intro' } });
    expect(JSON.stringify(result.content)).toContain('https://docs.example.com/docs/intro');

    await client.close();
  });
});
