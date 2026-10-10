/**
 * Tool checks for docs_search and docs_fetch: each entry in tool-checks.json
 * calls one tool against the fixture docs (scripts/test-mcp-server.mjs) and
 * asserts on its response with MST's matchers. They run on every protocol in
 * playwright.config.ts.
 *
 * Snapshot baselines are stored next to this file; refresh them with
 * `npm run test:mcp -- --update-snapshots`.
 */

import { z } from 'zod';
import { test, expect } from '@gleanwork/mcp-server-tester';
import toolChecks from './tool-checks.json' with { type: 'json' };

interface ToolCheck {
  id: string;
  description: string;
  tool: string;
  args: Record<string, unknown>;
  isError?: boolean;
  containsText?: string | string[];
  matchesPattern?: string | string[];
  schema?: keyof typeof schemas;
  snapshot?: string;
  responseSize?: { minBytes?: number; maxBytes?: number };
}

/**
 * The docs tools return Markdown text (no structuredContent), so schemas check
 * the CallToolResult envelope: exactly one non-empty text block, not an error.
 */
const schemas = {
  'single-text-block': z.object({
    content: z.tuple([z.object({ type: z.literal('text'), text: z.string().min(1) })]),
    isError: z.literal(false).optional(),
    structuredContent: z.never().optional(),
  }),
};

for (const check of toolChecks.checks as ToolCheck[]) {
  test(`${check.id}: ${check.description}`, async ({ mcp }) => {
    const result = await mcp.callTool(check.tool, check.args);

    if (check.isError === false) expect(result).not.toBeToolError();
    if (check.isError === true) expect(result).toBeToolError();
    if (check.containsText) expect(result).toContainToolText(check.containsText);
    if (check.matchesPattern) expect(result).toMatchToolPattern(check.matchesPattern);
    if (check.responseSize) expect(result).toHaveToolResponseSize(check.responseSize);
    if (check.schema) {
      const parsed = schemas[check.schema].safeParse(result);
      expect(parsed.success, JSON.stringify(parsed.error?.issues)).toBe(true);
    }
    if (check.snapshot) await expect(result).toMatchToolSnapshot(check.snapshot);
  });
}
