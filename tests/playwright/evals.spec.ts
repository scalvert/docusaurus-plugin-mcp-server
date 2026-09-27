/**
 * Data-driven evals for the docs tools, using mcp-server-tester's
 * eval datasets (direct mode: no LLM, deterministic, runs in CI).
 *
 * Cases live in ./evals/*.json. Snapshot baselines are stored by Playwright
 * next to this file; refresh them with `npm run test:mcp -- --update-snapshots`.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, expect, loadEvalDataset, runEvalDataset } from '@gleanwork/mcp-server-tester';

const here = path.dirname(fileURLToPath(import.meta.url));

test('docs tools eval dataset', async ({ mcp }, testInfo) => {
  const dataset = await loadEvalDataset(path.join(here, 'evals', 'docs-tools.json'));
  const result = await runEvalDataset({ dataset }, { mcp, testInfo, expect });

  const failures = result.caseResults
    .filter((c) => !c.pass)
    .map((c) => ({
      id: c.id,
      error: c.error,
      failed: Object.entries(c.expectations)
        .filter(([, e]) => e && !e.pass)
        .map(([type, e]) => `${type}: ${e?.details ?? ''}`),
    }));

  expect(failures, JSON.stringify(failures, null, 2)).toEqual([]);
  expect(result.passed).toBe(dataset.cases.length);
});
