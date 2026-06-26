import { describe, it, expect, vi } from 'vitest';
import mcpServerPluginDefault, {
  mcpServerPlugin,
  DEFAULT_PLUGIN_OPTIONS,
  docsSearchTool,
  docsFetchTool,
} from 'docusaurus-plugin-mcp-server';
import { createNodeHandler } from 'docusaurus-plugin-mcp-server/adapters/node';
import type { LoadContext } from '@docusaurus/types';
import type { IncomingMessage, ServerResponse } from 'node:http';

// Locks the stable 1.0.0 public surface: these symbols are exported and
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

  it('DEFAULT_PLUGIN_OPTIONS exposes the documented defaults', () => {
    expect(DEFAULT_PLUGIN_OPTIONS.outputDir).toBe('mcp');
    expect(DEFAULT_PLUGIN_OPTIONS.minContentLength).toBe(50);
    expect(DEFAULT_PLUGIN_OPTIONS.search).toBe('flexsearch');
    expect(DEFAULT_PLUGIN_OPTIONS.excludeRoutes).toEqual(['/404*', '/search*']);
    expect(DEFAULT_PLUGIN_OPTIONS.server.name).toBe('docs-mcp-server');
    expect(DEFAULT_PLUGIN_OPTIONS.contentSelectors[0]).toBe('article');
  });

  it('tool definitions expose stable names and input schemas', () => {
    expect(docsSearchTool.name).toBe('docs_search');
    expect(docsSearchTool.inputSchema).toBeDefined();
    expect(docsFetchTool.name).toBe('docs_fetch');
    expect(docsFetchTool.inputSchema).toBeDefined();
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
