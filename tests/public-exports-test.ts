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
  ConfigurationError,
  evaluateSearch,
  McpDocsServer,
  LocalSearchIndexer,
  LocalSearchProvider,
  loadSearchProvider,
} from 'docusaurus-plugin-mcp-server';
import { z } from 'zod';
import { createNodeHandler } from 'docusaurus-plugin-mcp-server/adapters/node';
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

    const server = new McpDocsServer({
      name: 'x',
      docs: {},
      searchIndexData: {},
      flexsearch: {},
    } as never);
    await expect(server.initialize()).rejects.toThrow(/'flexsearch' server option was removed/);
    await expect(server.initialize()).rejects.toBeInstanceOf(ConfigurationError);
  });

  it('evaluateSearch is exported', () => {
    expect(typeof evaluateSearch).toBe('function');
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

  it('createNodeHandler returns a handler that answers CORS preflight with 204', async () => {
    const handler = createNodeHandler({ name: 'test', docs: {}, searchIndexData: {} });
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
