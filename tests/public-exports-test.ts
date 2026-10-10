import { describe, it, expect, vi } from 'vitest';
import mcpServerPluginDefault, {
  mcpServerPlugin,
  DEFAULT_PLUGIN_OPTIONS,
  docsSearchTool,
  docsFetchTool,
  docsSearchInputSchema,
  docsFetchInputSchema,
  buildSkillsArtifact,
  SkillValidationError,
  GuideValidationError,
  ConfigurationError,
  evaluateSearch,
  McpDocsServer,
  LocalSearchIndexer,
  LocalSearchProvider,
  loadSearchProvider,
} from 'docusaurus-plugin-mcp-server';
import { z } from 'zod';
import {
  createNodeHandler,
  readArtifactBundle,
  type ArtifactBundle,
  type NodeAdapterOptions,
} from 'docusaurus-plugin-mcp-server/adapters/node';
import type {
  ArtifactBundle as EdgeArtifactBundle,
  WebRequestHandlerConfig,
} from 'docusaurus-plugin-mcp-server/adapters';
import type {
  ArtifactBundle as MainArtifactBundle,
  McpDocsServerConfig,
  McpServerBundleConfig,
  SearchRanker,
} from 'docusaurus-plugin-mcp-server';
import type { LoadContext } from '@docusaurus/types';
import type { IncomingMessage, ServerResponse } from 'node:http';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

// Locks the stable 2.0.0 public surface: these symbols are exported and
// documented, so a regression in their shape is a breaking change.
describe('public API surface', () => {
  it('default export is the same plugin factory as the named mcpServerPlugin', () => {
    expect(mcpServerPluginDefault).toBe(mcpServerPlugin);
  });

  it('mcpServerPlugin returns a Docusaurus plugin with the expected name and hooks', () => {
    const context = {
      siteConfig: { url: 'https://docs.example.com', baseUrl: '/' },
    } as unknown as LoadContext;

    const plugin = mcpServerPlugin(context, { server: { name: 'test-docs' } });

    expect(plugin.name).toBe('docusaurus-plugin-mcp-server');
    expect(typeof plugin.postBuild).toBe('function');
    expect(typeof plugin.contentLoaded).toBe('function');
  });

  it('rejects the removed 1.x flexsearch plugin and server options', async () => {
    const context = {
      siteConfig: { url: 'https://docs.example.com', baseUrl: '/' },
    } as unknown as LoadContext;

    expect(() => mcpServerPlugin(context, { flexsearch: { tokenize: 'strict' } } as never)).toThrow(
      /'flexsearch' plugin option was removed/
    );
    // The 1.x provider name in the plugin's `search` option is rejected too.
    expect(() => mcpServerPlugin(context, { search: 'flexsearch' })).toThrow(
      /'flexsearch' search provider was replaced.*migrations\/1\.x-2\.0\.0\.md/
    );

    const server = new McpDocsServer({ artifacts: {}, flexsearch: {} } as never);
    await expect(server.initialize()).rejects.toThrow(/'flexsearch' server option was removed/);
    await expect(server.initialize()).rejects.toBeInstanceOf(ConfigurationError);
  });

  it('exports the artifact bundle type from every entry, and readArtifactBundle from Node', async () => {
    expect(typeof readArtifactBundle).toBe('function');
    // The three type exports are the same type.
    const check = (bundle: ArtifactBundle): [EdgeArtifactBundle, MainArtifactBundle] => [
      bundle,
      bundle,
    ];
    expect(typeof check).toBe('function');

    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'mcp-exports-'));
    try {
      await expect(readArtifactBundle(dir)).rejects.toBeInstanceOf(ConfigurationError);
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });

  it('McpServerBundleConfig needs only artifacts', () => {
    const config: McpServerBundleConfig = { artifacts: {} };
    expect(new McpDocsServer(config)).toBeInstanceOf(McpDocsServer);
  });

  it('exports config unions that take the bundle or the deprecated shapes', () => {
    const server: McpDocsServerConfig[] = [
      { artifacts: {} },
      { name: 'x', docs: {}, searchIndexData: {} },
    ];
    const web: WebRequestHandlerConfig[] = [{ artifacts: {}, corsOrigin: '*' }];
    const node: NodeAdapterOptions[] = [{ artifactsDir: 'build/mcp', corsOrigin: false }];
    expect([server.length, web.length, node.length]).toEqual([2, 1, 1]);
  });

  it('evaluateSearch is exported', () => {
    expect(typeof evaluateSearch).toBe('function');
  });

  it('exports the SearchRanker type, which loadSearchProvider and the server accept', async () => {
    const ranker: SearchRanker = { name: 'ranker', search: async () => [] };
    await expect(loadSearchProvider(ranker)).resolves.toBe(ranker);
    expect(new McpDocsServer({ artifacts: {}, search: ranker })).toBeInstanceOf(McpDocsServer);
  });

  it('exports the built-in local search classes for passing an instance as `search`', async () => {
    const indexer = new LocalSearchIndexer();
    expect(indexer.name).toBe('local');
    const provider = new LocalSearchProvider();
    await expect(loadSearchProvider(provider)).resolves.toBe(provider);
  });

  it('DEFAULT_PLUGIN_OPTIONS exposes the documented defaults', () => {
    expect(DEFAULT_PLUGIN_OPTIONS.outputDir).toBe('mcp');
    expect(DEFAULT_PLUGIN_OPTIONS.minContentLength).toBe(50);
    expect(DEFAULT_PLUGIN_OPTIONS.search).toBe('local');
    expect(DEFAULT_PLUGIN_OPTIONS.excludeRoutes).toEqual(['/404*', '/search*']);
    expect(DEFAULT_PLUGIN_OPTIONS.server.name).toBe('docs-mcp-server');
    expect(DEFAULT_PLUGIN_OPTIONS.contentSelectors[0]).toBe('article');
  });

  it('tool definitions expose stable names and z.object input schemas', () => {
    expect(docsSearchTool.name).toBe('docs_search');
    expect(docsSearchTool.inputSchema).toBeInstanceOf(z.ZodObject);
    expect(Object.keys(docsSearchTool.inputSchema.shape)).toEqual(['query', 'limit']);
    expect(docsFetchTool.name).toBe('docs_fetch');
    expect(docsFetchTool.inputSchema).toBeInstanceOf(z.ZodObject);
    expect(Object.keys(docsFetchTool.inputSchema.shape)).toEqual(['url']);
  });

  it('raw input shapes stay exported for custom tool registration', () => {
    expect(Object.keys(docsSearchInputSchema)).toEqual(['query', 'limit']);
    expect(Object.keys(docsFetchInputSchema)).toEqual(['url']);
  });

  it('the exported docs_fetch shape still requires an absolute URL, as in 2.0', () => {
    // The server registers a looser schema; custom handlers built on this one may rely on a URL.
    const schema = z.object(docsFetchInputSchema);
    expect(schema.safeParse({ url: 'https://docs.example.com/docs/intro' }).success).toBe(true);
    expect(schema.safeParse({ url: '/docs/intro' }).success).toBe(false);
    expect(docsFetchTool.inputSchema.safeParse({ url: '/docs/intro' }).success).toBe(false);
  });

  it('buildSkillsArtifact packages the built-in skill', async () => {
    const artifact = await buildSkillsArtifact({ builtin: true, siteTitle: 'Docs' });
    expect(artifact).toMatchObject({ version: 1 });
    expect(artifact.skills[0]?.frontmatter.name).toBe('docs-research');
  });

  it('buildSkillsArtifact rejects an invalid skill with SkillValidationError', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'mcp-exports-'));
    try {
      await fs.mkdir(path.join(dir, 'broken'));
      await fs.writeFile(path.join(dir, 'broken', 'SKILL.md'), '# no frontmatter');
      await expect(
        buildSkillsArtifact({ builtin: false, dir, siteTitle: 'Docs' })
      ).rejects.toBeInstanceOf(SkillValidationError);
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });

  it('GuideValidationError lists every problem and links the guide docs', () => {
    const error = new GuideValidationError(['/a: one', '/b: two']);
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('GuideValidationError');
    expect(error.problems).toEqual(['/a: one', '/b: two']);
    expect(error.message).toContain('  - /a: one\n  - /b: two');
  });

  it('the theme entry exports the guide and audience components', async () => {
    const theme = await import('docusaurus-plugin-mcp-server/theme');
    for (const name of [
      'AgentGuide',
      'DoneWhen',
      'Prerequisites',
      'Step',
      'Check',
      'Symptom',
      'ForAgents',
      'ForHumans',
      'McpInstallButton',
    ]) {
      expect(typeof (theme as Record<string, unknown>)[name]).toBe('function');
    }
  });

  it('createNodeHandler returns a handler that answers CORS preflight with 204', async () => {
    const handler = createNodeHandler({ artifactsDir: 'build/mcp' });
    expect(typeof handler).toBe('function');

    const headers: Record<string, string> = {};
    const res = {
      setHeader: (k: string, v: string) => {
        headers[k] = v;
      },
      writeHead: vi.fn(),
      end: vi.fn(),
    } as unknown as ServerResponse;
    const req = { method: 'OPTIONS' } as IncomingMessage;

    await handler(req, res);

    expect(res.writeHead).toHaveBeenCalledWith(204);
    expect(headers['Access-Control-Allow-Origin']).toBe('*');
  });
});
