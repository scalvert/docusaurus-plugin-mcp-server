/**
 * End-to-end protocol tests with the official v2 client, over both eras:
 * - modern: MCP 2026-07-28 (server/discover, per-request envelope)
 * - legacy: 2025-era initialize handshake
 *
 * Requests are routed in-process to McpDocsServer.handleWebRequest via the
 * client transport's `fetch` option, and raw response bodies are recorded so
 * wire-level fields (resultType, ttlMs, cacheScope) can be asserted.
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { z } from 'zod';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { McpDocsServer } from '../src/mcp/server.js';
import { buildSkillsArtifact } from '../src/skills/packager.js';
import type { ProcessedDoc, SkillsArtifact } from '../src/types/index.js';
import { buildTestBundle } from './helpers/bundle.js';

// Indexer and server progress logs are expected here; keep test output readable.
beforeAll(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
});
afterAll(() => {
  vi.restoreAllMocks();
});

const MODERN = '2026-07-28';

const docs: ProcessedDoc[] = [
  {
    route: '/docs/install',
    title: 'Installation',
    description: 'Install the thing',
    markdown: '# Installation\n\nRun npm install to install the widget toolkit.',
    headings: [
      { level: 1, text: 'Installation', id: 'installation', startOffset: 0, endOffset: 14 },
    ],
  },
];

async function buildServer(skills?: SkillsArtifact) {
  const artifacts = await buildTestBundle(docs, {
    name: 'example-docs',
    version: '2.0.0',
    baseUrl: 'https://docs.example.com',
    skills,
  });

  return new McpDocsServer({ artifacts, instructions: 'Search first.' });
}

interface Wire {
  requests: Array<{ method?: string; headers: Headers; body: unknown }>;
  responses: Array<{ status: number; body: unknown }>;
}

async function connect(server: McpDocsServer, mode: 'legacy' | 'modern') {
  const wire: Wire = { requests: [], responses: [] };

  const fetch = async (input: string | URL | Request, init?: RequestInit) => {
    const request = new Request(input, init);
    const bodyText = request.method === 'POST' ? await request.clone().text() : '';
    const body = bodyText ? JSON.parse(bodyText) : undefined;
    wire.requests.push({ method: body?.method, headers: request.headers, body });

    const response = await server.handleWebRequest(request);
    const text = await response.clone().text();
    let parsed: unknown = text;
    try {
      parsed = JSON.parse(text);
    } catch {
      // non-JSON (e.g. 202 with empty body)
    }
    wire.responses.push({ status: response.status, body: parsed });
    return response;
  };

  const client = new Client(
    { name: 'era-test', version: '1.0.0' },
    {
      versionNegotiation: { mode: mode === 'modern' ? { pin: MODERN } : 'legacy' },
    }
  );
  const transport = new StreamableHTTPClientTransport(new URL('https://docs.example.com/mcp'), {
    fetch,
  });
  await client.connect(transport);
  return { client, wire };
}

function lastResult(wire: Wire): Record<string, unknown> {
  const last = wire.responses.at(-1)?.body as { result?: Record<string, unknown> };
  return last?.result ?? {};
}

const SkillsListResult = z.looseObject({
  skills: z.array(
    z.looseObject({
      uri: z.string(),
      frontmatter: z.looseObject({ name: z.string(), description: z.string() }),
      resources: z.array(z.object({ uri: z.string(), digest: z.string(), size: z.number() })),
    })
  ),
});

const SkillsGetResult = z.looseObject({
  skill: z.looseObject({ uri: z.string() }),
});

describe.each(['modern', 'legacy'] as const)('%s client', (mode) => {
  let server: McpDocsServer;

  beforeAll(async () => {
    const skills = await buildSkillsArtifact({ builtin: true, siteTitle: 'Example' });
    server = await buildServer(skills);
  });

  it('negotiates the expected protocol era', async () => {
    const { client, wire } = await connect(server, mode);
    const firstMethod = wire.requests[0]?.method;

    if (mode === 'modern') {
      expect(firstMethod).toBe('server/discover');
      expect(client.getNegotiatedProtocolVersion()).toBe(MODERN);
    } else {
      expect(firstMethod).toBe('initialize');
      expect(client.getNegotiatedProtocolVersion()).not.toBe(MODERN);
    }
    expect(client.getServerVersion()).toMatchObject({ name: 'example-docs', version: '2.0.0' });
  });

  it('lists and calls docs tools', async () => {
    const { client } = await connect(server, mode);

    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual(['docs_fetch', 'docs_search']);
    const search = tools.find((t) => t.name === 'docs_search');
    expect(search?.inputSchema.properties).toHaveProperty('query');

    const result = await client.callTool({ name: 'docs_search', arguments: { query: 'install' } });
    expect(JSON.stringify(result.content)).toContain('https://docs.example.com/docs/install');

    const page = await client.callTool({
      name: 'docs_fetch',
      arguments: { url: 'https://docs.example.com/docs/install' },
    });
    expect(JSON.stringify(page.content)).toContain('widget toolkit');
  });

  it('declares the skills extension and points to skills in instructions', async () => {
    const { client } = await connect(server, mode);

    expect(client.getServerCapabilities()?.extensions).toHaveProperty(
      'io.modelcontextprotocol/skills'
    );
    const instructions = client.getInstructions() ?? '';
    expect(instructions).toContain('Search first.');
    expect(instructions).toContain('skill://docs-research/SKILL.md');
  });

  it('serves skills/list, skills/get, and skill:// resources with matching digests', async () => {
    const { client } = await connect(server, mode);

    const list = await client.request({ method: 'skills/list', params: {} }, SkillsListResult);
    expect(list.skills).toHaveLength(1);
    const entry = list.skills[0]!;
    expect(entry.uri).toBe('skill://docs-research/SKILL.md');
    expect(entry.frontmatter.name).toBe('docs-research');

    const got = await client.request(
      { method: 'skills/get', params: { uri: entry.uri } },
      SkillsGetResult
    );
    expect(got.skill).toEqual(entry);

    // SEP-2640: the SKILL.md resource's name is the frontmatter name.
    const { resources } = await client.listResources();
    expect(resources.find((r) => r.uri === entry.uri)?.name).toBe('docs-research');

    const read = await client.readResource({ uri: entry.uri });
    const content = read.contents[0] as { text: string };
    const bytes = new TextEncoder().encode(content.text);
    const hash = await crypto.subtle.digest('SHA-256', bytes);
    const hex = Buffer.from(hash).toString('hex');

    expect(entry.resources[0]).toEqual({
      uri: entry.uri,
      digest: `sha256:${hex}`,
      size: bytes.length,
    });
  });

  it('rejects skills/get for an unknown skill with -32602', async () => {
    const { client } = await connect(server, mode);
    await expect(
      client.request(
        { method: 'skills/get', params: { uri: 'skill://nope/SKILL.md' } },
        SkillsGetResult
      )
    ).rejects.toMatchObject({ code: -32602 });
  });
});

describe('modern wire format', () => {
  it('stamps resultType and cache hints on cacheable results and skills/list', async () => {
    const skills = await buildSkillsArtifact({ builtin: true, siteTitle: 'Example' });
    const { client, wire } = await connect(await buildServer(skills), 'modern');

    await client.listTools({}, { cacheMode: 'bypass' });
    expect(lastResult(wire)).toMatchObject({
      resultType: 'complete',
      ttlMs: 300000,
      cacheScope: 'public',
    });

    await client.request({ method: 'skills/list', params: {} }, SkillsListResult);
    expect(lastResult(wire)).toMatchObject({ ttlMs: 300000, cacheScope: 'public' });

    // Modern requests carry the routing headers the CORS config now allows.
    const toolsCall = wire.requests.find((r) => r.method === 'tools/list');
    expect(toolsCall?.headers.get('mcp-method')).toBe('tools/list');
  });
});

describe('legacy wire format', () => {
  it('carries no 2026-07-28 cache fields on core results or skills/list', async () => {
    const skills = await buildSkillsArtifact({ builtin: true, siteTitle: 'Example' });
    const { client, wire } = await connect(await buildServer(skills), 'legacy');

    await client.listTools();
    expect(lastResult(wire)).not.toHaveProperty('ttlMs');
    expect(lastResult(wire)).not.toHaveProperty('resultType');

    await client.request({ method: 'skills/list', params: {} }, SkillsListResult);
    const result = lastResult(wire);
    expect(result).toHaveProperty('skills');
    expect(result).not.toHaveProperty('ttlMs');
    expect(result).not.toHaveProperty('cacheScope');
  });
});

describe('malformed skills.json', () => {
  it('errors on resources/read for a file with neither text nor blob', async () => {
    const skills = await buildSkillsArtifact({ builtin: true, siteTitle: 'Example' });
    const file = skills.skills[0]!.files[0]!;
    delete file.text;
    const { client } = await connect(await buildServer(skills), 'modern');

    await expect(client.readResource({ uri: 'skill://docs-research/SKILL.md' })).rejects.toThrow(
      /no content in skills\.json/
    );
  });
});

describe('without skills', () => {
  it('omits the extension and adds nothing to instructions', async () => {
    const { client } = await connect(await buildServer(), 'modern');
    expect(client.getServerCapabilities()?.extensions ?? {}).not.toHaveProperty(
      'io.modelcontextprotocol/skills'
    );
    expect(client.getInstructions()).toBe('Search first.');
  });
});
