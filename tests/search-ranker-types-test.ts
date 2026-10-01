/**
 * Type-level checks for SearchRanker (2.2), against the published types:
 * `npm run typecheck` is the real assertion (the package specifiers resolve
 * to `dist/*.d.ts`). The runtime checks keep the fixtures in use.
 */

import { describe, it, expect, expectTypeOf } from 'vitest';
import {
  McpDocsServer,
  LocalSearchProvider,
  evaluateSearch,
  loadSearchProvider,
  type McpDocsServerConfig,
  type SearchProvider,
  type SearchRanker,
  type SearchResult,
} from 'docusaurus-plugin-mcp-server';
import {
  createWebRequestHandler,
  type WebRequestHandlerConfig,
} from 'docusaurus-plugin-mcp-server/adapters';
import { createNodeHandler } from 'docusaurus-plugin-mcp-server/adapters/node';

describe('SearchRanker types', () => {
  it('a { name, search } object is a server search option', () => {
    const server = new McpDocsServer({
      artifacts: {},
      search: { name: 'x', search: async () => [] },
    });
    expect(server).toBeInstanceOf(McpDocsServer);

    const ranker: SearchRanker = { name: 'r', search: async () => [] };
    const configs: McpDocsServerConfig[] = [
      { artifacts: {}, search: ranker },
      { name: 'docs', docs: {}, searchIndexData: {}, search: ranker },
    ];
    const web: WebRequestHandlerConfig = { artifacts: {}, search: ranker };
    expect(configs).toHaveLength(2);
    expect(typeof createWebRequestHandler(web)).toBe('function');
    expect(typeof createNodeHandler({ artifactsDir: 'build/mcp', search: ranker })).toBe(
      'function'
    );
  });

  it('every SearchProvider is a SearchRanker', () => {
    expectTypeOf<SearchProvider>().toExtend<SearchRanker>();
    const asRanker: SearchRanker = new LocalSearchProvider();
    expect(asRanker.name).toBe('local');
  });

  it('loadSearchProvider returns a ranker as its own type, and a SearchProvider as in 2.1', async () => {
    const ranker = { name: 'mine', search: async (): Promise<SearchResult[]> => [], extra: 1 };
    const loaded = loadSearchProvider(ranker);
    expectTypeOf(loaded).toEqualTypeOf<Promise<typeof ranker>>();
    expect((await loaded).extra).toBe(1);

    const typed: SearchRanker = ranker;
    expectTypeOf(loadSearchProvider(typed)).toEqualTypeOf<Promise<SearchRanker>>();
    // A SearchProvider instance resolves to SearchProvider, exactly as in 2.1,
    // so 2.1 code that reassigns the result keeps compiling.
    const local = new LocalSearchProvider();
    expectTypeOf(loadSearchProvider(local)).toEqualTypeOf<Promise<SearchProvider>>();
    let reassigned = await loadSearchProvider(local);
    expect(reassigned.name).toBe('local');
    reassigned = await loadSearchProvider('local');
    expect(reassigned.name).toBe('local');
    // An `any` still resolves to SearchProvider, as in 2.1.
    expectTypeOf(loadSearchProvider(local as any)).toEqualTypeOf<Promise<SearchProvider>>(); // eslint-disable-line @typescript-eslint/no-explicit-any
    // Names and module paths still resolve to a full SearchProvider.
    expectTypeOf(loadSearchProvider('local')).toEqualTypeOf<Promise<SearchProvider>>();
  });

  it('a ranker’s optional members are optional calls', () => {
    const ranker: SearchRanker = { name: 'r', search: async () => [] };
    // @ts-expect-error -- initialize is optional on a SearchRanker (TS2722 without `?.`)
    expect(() => ranker.initialize({} as never)).toThrow();
    expect(ranker.isReady?.() ?? true).toBe(true);
  });

  it('evaluateSearch accepts a ranker', async () => {
    const ranker: SearchRanker = {
      name: 'r',
      search: async () => [
        { url: 'https://x/docs/a', route: '/docs/a', title: 'A', score: 1, snippet: '' },
      ],
    };
    const report = await evaluateSearch(ranker, [{ query: 'a', expected: ['/docs/a'] }]);
    expect(report.hitsAt[1]).toBe(1);
  });
});
