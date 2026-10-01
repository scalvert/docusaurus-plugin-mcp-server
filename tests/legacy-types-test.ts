/**
 * Type-level compatibility: TypeScript written against 2.1 must still compile
 * against 2.2. `npm run typecheck` is the real assertion here; a regression
 * fails it (TS2322, TS2339, TS2312, ...). The runtime tests only keep the
 * fixtures from being optimized away.
 */

import { describe, it, expect, expectTypeOf } from 'vitest';
import {
  McpDocsServer,
  LocalSearchProvider,
  loadSearchProvider,
  type BuiltinSearchOptions,
  type McpServerConfig,
  type McpServerDataConfig,
  type McpServerFileConfig,
  type ProcessedDoc,
  type ProviderContext,
  type SearchOptions,
  type SearchProvider,
  type SearchProviderInitData,
  type SearchResult,
} from 'docusaurus-plugin-mcp-server';
import type { SearchProviderModule } from '../src/providers/types.js';
import {
  createWebRequestHandler,
  type WebRequestAdapterConfig,
} from 'docusaurus-plugin-mcp-server/adapters';
import {
  createNodeHandler,
  type NodeServerOptions,
} from 'docusaurus-plugin-mcp-server/adapters/node';

// 2.1: `name` is a required string on every config union.
function nameOf(config: McpServerConfig): string {
  return config.name;
}
function adapterName(config: WebRequestAdapterConfig): string {
  return config.name;
}
function nodeName(options: NodeServerOptions): string {
  return options.name;
}

// 2.1: the web adapter config is an interface with the data members.
interface MyWorkerConfig extends WebRequestAdapterConfig {
  region: string;
}

const data: McpServerDataConfig = { name: 'docs', docs: {}, searchIndexData: {} };
const file: McpServerFileConfig = { name: 'docs', docsPath: 'a.json', indexPath: 'b.json' };
const worker: MyWorkerConfig = { ...data, region: 'iad', corsOrigin: '*' };

describe('2.1 types still compile', () => {
  it('keeps the config unions, required names, and the adapter interface', () => {
    const docsOfWorker: WebRequestAdapterConfig['docs'] = worker.docs;
    const legacyInit: SearchProviderInitData = { docsPath: 'a.json', indexPath: 'b.json' };

    expect([nameOf(data), nameOf(file), adapterName(worker), nodeName(file)]).toEqual([
      'docs',
      'docs',
      'docs',
      'docs',
    ]);
    expect(docsOfWorker).toEqual({});
    expect(legacyInit.docsPath).toBe('a.json');
  });

  it('keeps SearchProvider and loadSearchProvider callable as in 2.1', async () => {
    const context: ProviderContext = {
      baseUrl: 'https://docs.example.com',
      serverName: 'docs',
      serverVersion: '1.0.0',
      outputDir: '',
    };

    // The loader's result has a required initialize and isReady (no TS2722).
    const loaded = await loadSearchProvider('local');
    await expect(loaded.initialize(context, { docs: {}, indexData: {} })).rejects.toThrow();
    expect(loaded.isReady()).toBe(false);

    // A SearchProvider-typed value: required members, callable directly.
    const p: SearchProvider = new LocalSearchProvider();
    expect(p.isReady()).toBe(false);
    await expect(p.initialize(context)).rejects.toThrow(/SearchProviderInitData required/);

    // A wrapper that forwards to an inner SearchProvider without `?.`.
    class Logged implements SearchProvider {
      readonly name: string;
      constructor(private readonly inner: SearchProvider) {
        this.name = `logged-${inner.name}`;
      }
      initialize(ctx: ProviderContext, initData?: SearchProviderInitData): Promise<void> {
        return this.inner.initialize(ctx, initData);
      }
      isReady(): boolean {
        return this.inner.isReady();
      }
      search(query: string, options?: SearchOptions): Promise<SearchResult[]> {
        return this.inner.search(query, options);
      }
      getDocument(url: string): Promise<ProcessedDoc | null> {
        return this.inner.getDocument ? this.inner.getDocument(url) : Promise.resolve(null);
      }
      healthCheck(): Promise<{ healthy: boolean; message?: string }> {
        return this.inner.healthCheck
          ? this.inner.healthCheck()
          : Promise.resolve({ healthy: this.isReady() });
      }
    }
    const logged = new Logged(p);
    expect(logged.isReady()).toBe(false);
    expect(new McpDocsServer({ ...data, search: logged })).toBeInstanceOf(McpDocsServer);

    // `ReturnType`/`Parameters` read the last overload: still the 2.1 signature.
    expectTypeOf<ReturnType<typeof loadSearchProvider>>().toEqualTypeOf<Promise<SearchProvider>>();
    expectTypeOf<Parameters<typeof loadSearchProvider>>().toEqualTypeOf<
      [specifier: string | SearchProvider, builtinOptions?: BuiltinSearchOptions]
    >();
    // A SearchProvider instance still loads as a SearchProvider.
    expectTypeOf(loadSearchProvider(p)).toEqualTypeOf<Promise<SearchProvider>>();
    // A `string | SearchProvider` value still type-checks.
    const either = 'local' as string | SearchProvider;
    expectTypeOf(loadSearchProvider(either)).toEqualTypeOf<Promise<SearchProvider>>();

    // SearchProvider still requires initialize and isReady.
    // @ts-expect-error -- missing initialize and isReady
    const partial: SearchProvider = { name: 'x', search: async () => [] };
    expect(partial.name).toBe('x');
    expectTypeOf<SearchProviderModule['default']>().toEqualTypeOf<new () => SearchProvider>();
  });

  it('accepts the 2.1 configs where 2.1 did', () => {
    const configs: McpServerConfig[] = [data, file];
    expect(configs.map((c) => new McpDocsServer(c))).toHaveLength(2);
    expect(typeof createWebRequestHandler(worker)).toBe('function');
    const options: NodeServerOptions = { ...file, corsOrigin: false };
    expect(typeof createNodeHandler(options)).toBe('function');
  });
});
