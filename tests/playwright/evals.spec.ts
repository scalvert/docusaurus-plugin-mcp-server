/**
 * Data-driven evals for the docs tools, using mcp-server-tester's
 * eval datasets (direct mode: no LLM, deterministic, runs in CI).
 *
 * Cases live in ./evals/*.json. Snapshot baselines are stored by Playwright
 * next to this file; refresh them with `npm run test:mcp -- --update-snapshots`.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { test, expect, loadEvalDataset, runEvalDataset } from '@gleanwork/mcp-server-tester';

const here = path.dirname(fileURLToPath(import.meta.url));

/**
 * Schemas referenced by `expect.schema` in the datasets. The docs tools return
 * markdown text (no structuredContent), so schemas check the CallToolResult
 * envelope: exactly one non-empty text block, not an error.
 */
const schemas = {
  'single-text-block': z.object({
    content: z.tuple([z.object({ type: z.literal('text'), text: z.string().min(1) })]),
    isError: z.literal(false).optional(),
    structuredContent: z.never().optional(),
  }),
};

test('docs tools eval dataset', async ({ mcp }, testInfo) => {
  const dataset = await loadEvalDataset(path.join(here, 'evals', 'docs-tools.json'), { schemas });
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
