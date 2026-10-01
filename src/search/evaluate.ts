import type { SearchRanker } from '../providers/types.js';

/**
 * One labeled query: the pages that fully answer it.
 *
 * @experimental May change in a 2.x minor release; pin a version if you depend on it.
 */
export interface SearchEvalCase {
  /** The query, as a user or agent would type it */
  query: string;
  /**
   * Routes (e.g. `/docs/intro`) or full URLs of every page that fully answers
   * the query. A result counts as correct if it matches any of them.
   */
  expected: string[];
}

/**
 * Result for one {@link SearchEvalCase}.
 *
 * @experimental May change in a 2.x minor release; pin a version if you depend on it.
 */
export interface SearchEvalCaseResult {
  query: string;
  expected: string[];
  /** 1-based rank of the first correct result, or null if none was returned */
  rank: number | null;
  /** Routes returned, in rank order */
  routes: string[];
}

/**
 * Aggregate ranking quality over a set of cases.
 *
 * @experimental May change in a 2.x minor release; pin a version if you depend on it.
 */
export interface SearchEvalReport {
  /** Number of cases */
  total: number;
  /** Cases whose first correct result is at rank <= k, for each k requested */
  hitsAt: Record<number, number>;
  /** Mean reciprocal rank of the first correct result (0 when none is returned) */
  mrr: number;
  cases: SearchEvalCaseResult[];
}

/**
 * Options for {@link evaluateSearch}.
 *
 * @experimental May change in a 2.x minor release; pin a version if you depend on it.
 */
export interface EvaluateSearchOptions {
  /** Results to request per query. Default: 10 */
  limit?: number;
  /** Cutoffs to report in `hitsAt`. Default: [1, 3, 5] */
  k?: number[];
}

/**
 * Measure how well a search provider ranks the right pages for a set of
 * labeled queries.
 *
 * Use it to compare providers, or to guard ranking in CI: build the site, load
 * the provider, and assert on `hitsAt` and `mrr`. It only calls `search`, so
 * initialize the provider first if it needs it.
 *
 * @example
 * ```typescript
 * const provider = await loadSearchProvider('local');
 * await provider.initialize(context, { bundle: await readArtifactBundle('build/mcp') });
 * const report = await evaluateSearch(provider, [
 *   { query: 'install the CLI', expected: ['/docs/installation'] },
 * ]);
 * expect(report.hitsAt[3] / report.total).toBeGreaterThanOrEqual(0.9);
 * ```
 *
 * @experimental May change in a 2.x minor release; pin a version if you depend on it.
 */
export async function evaluateSearch(
  provider: SearchRanker,
  cases: SearchEvalCase[],
  options: EvaluateSearchOptions = {}
): Promise<SearchEvalReport> {
  const limit = options.limit ?? 10;
  const cutoffs = options.k ?? [1, 3, 5];
  const hitsAt: Record<number, number> = Object.fromEntries(cutoffs.map((k) => [k, 0]));
  let reciprocalRankSum = 0;
  const results: SearchEvalCaseResult[] = [];

  for (const { query, expected } of cases) {
    const hits = await provider.search(query, { limit });
    const routes = hits.map((hit) => hit.route);
    const index = hits.findIndex(
      (hit) => expected.includes(hit.route) || expected.includes(hit.url)
    );
    const rank = index < 0 ? null : index + 1;

    if (rank !== null) {
      reciprocalRankSum += 1 / rank;
      for (const k of cutoffs) {
        if (rank <= k) hitsAt[k] = (hitsAt[k] ?? 0) + 1;
      }
    }
    results.push({ query, expected, rank, routes });
  }

  return {
    total: cases.length,
    hitsAt,
    mrr: cases.length === 0 ? 0 : reciprocalRankSum / cases.length,
    cases: results,
  };
}
