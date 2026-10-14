import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { McpDocsServer } from '../src/mcp/server.js';
import { isClientRejection } from '../src/mcp/rejections.js';
import type { ProcessedDoc } from '../src/types/index.js';
import { buildTestBundle } from './helpers/bundle.js';

/**
 * Requests the SDK rejects with a 4xx are answered, not logged. These are the
 * malformed requests the tester's conformance checks send
 * (@gleanwork/mcp-server-tester: unsupported_version_rejected,
 * missing_meta_rejected, header_mismatch_rejected). If the SDK changes how it
 * reports one, this test fails, not the test output quietly filling with
 * stack traces again.
 */

const docs: ProcessedDoc[] = [
  {
    route: '/docs/intro',
    title: 'Intro',
    description: 'Intro',
    markdown: '# Intro\n\nHello.',
    headings: [{ level: 1, text: 'Intro', id: 'intro', startOffset: 0, endOffset: 16 }],
  },
];

const MODERN = '2026-07-28';

function meta(protocolVersion: string) {
  return {
    'io.modelcontextprotocol/protocolVersion': protocolVersion,
    'io.modelcontextprotocol/clientCapabilities': {},
    'io.modelcontextprotocol/clientInfo': { name: 'rejections-test', version: '1' },
  };
}

interface Probe {
  method: string;
  params: Record<string, unknown>;
  headers?: Record<string, string>;
}

/** A modern-era request, with the headers a 2026-07-28 client sends. */
function post({ method, params, headers }: Probe): Request {
  return new Request('https://localhost/mcp', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
      'MCP-Protocol-Version': MODERN,
      'Mcp-Method': method,
      ...headers,
    },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  });
}

const rejected: Array<[string, Probe, number]> = [
  [
    'an unsupported protocol version',
    {
      method: 'tools/list',
      params: { _meta: meta('1900-01-01') },
      headers: { 'MCP-Protocol-Version': '1900-01-01' },
    },
    -32022,
  ],
  [
    'a _meta envelope without clientCapabilities',
    {
      method: 'tools/list',
      params: { _meta: { 'io.modelcontextprotocol/protocolVersion': MODERN } },
    },
    -32602,
  ],
  [
    'an Mcp-Method header that disagrees with the body',
    {
      method: 'tools/list',
      params: { _meta: meta(MODERN) },
      headers: { 'Mcp-Method': 'prompts/list' },
    },
    -32020,
  ],
  [
    'an Mcp-Name header that disagrees with the body',
    {
      method: 'tools/call',
      params: { name: 'docs_search', arguments: { query: 'intro' }, _meta: meta(MODERN) },
      headers: { 'Mcp-Name': 'mst_other_tool' },
    },
    -32020,
  ],
];

describe('requests the SDK rejects', () => {
  let server: McpDocsServer;

  beforeAll(async () => {
    server = new McpDocsServer({ artifacts: await buildTestBundle(docs) });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('serves a well-formed modern request (the probes differ from it in one way each)', async () => {
    const error = vi.spyOn(console, 'error');
    const response = await server.handleWebRequest(
      post({ method: 'tools/list', params: { _meta: meta(MODERN) } })
    );
    expect(response.status).toBe(200);
    expect(error).not.toHaveBeenCalled();
  });

  it.each(rejected)('answers %s with a 400 and logs nothing', async (_name, probe, code) => {
    const error = vi.spyOn(console, 'error');
    const warn = vi.spyOn(console, 'warn');

    const response = await server.handleWebRequest(post(probe));

    expect(response.status).toBe(400);
    const body = (await response.json()) as { error?: { code: number } };
    expect(body.error?.code).toBe(code);
    expect(error).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
  });
});

describe('isClientRejection', () => {
  it('treats any other error as a server failure, so it is logged', () => {
    expect(isClientRejection(new Error('boom'))).toBe(false);
    expect(
      isClientRejection(new TypeError("Cannot read properties of undefined (reading 'x')"))
    ).toBe(false);
    expect(isClientRejection('Rejected inbound request (not an Error)')).toBe(false);
    expect(isClientRejection(undefined)).toBe(false);
  });
});
