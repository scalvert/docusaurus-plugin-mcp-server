/**
 * MCP Server Integration Tests using @gleanwork/mcp-server-tester
 *
 * Protocol conformance and behavior that doesn't fit an eval case. Tool
 * output checks live in the eval dataset (evals.spec.ts + evals/*.json).
 *
 * The tester's client is a 2025-era (v1 SDK) client, so this suite also
 * guards backward compatibility with pre-2026-07-28 clients. The
 * 2026-07-28 path is covered by tests/protocol-eras-test.ts.
 *
 * The test server is started automatically via Playwright's webServer config.
 */

import { test, expect, runConformanceChecks } from '@gleanwork/mcp-server-tester';

test.describe('MCP Protocol Conformance', () => {
  test('passes the tester conformance checks', async ({ mcp }, testInfo) => {
    const result = await runConformanceChecks(
      mcp,
      { requiredTools: ['docs_search', 'docs_fetch'], validateSchemas: true },
      testInfo
    );

    const failed = result.checks.filter((c) => !c.pass);
    expect(failed, JSON.stringify(failed, null, 2)).toEqual([]);
    expect(result.raw.serverInfo).toMatchObject({ name: 'test-docs', version: '1.0.0' });
    expect(result.raw.tools).toHaveLength(2);
  });

  test('tools are annotated read-only', async ({ mcp }) => {
    const tools = await mcp.listTools();
    for (const tool of tools) {
      expect(tool.annotations, tool.name).toMatchObject({ readOnlyHint: true });
    }
  });

  test('rejects an unknown tool with a JSON-RPC invalid-params error', async ({ mcp }) => {
    // MCP SDK v2: unknown tools are a protocol error (-32602), not an isError result.
    await expect(mcp.callTool('nonexistent_tool', {})).rejects.toMatchObject({ code: -32602 });
  });
});

test.describe('Skills (2025-era client)', () => {
  test('points to skills in instructions', async ({ mcp }) => {
    // 2025-era clients drop the capabilities `extensions` field, so the
    // instructions pointer is how they discover skills.
    expect(mcp.client.getInstructions()).toContain('skill://docs-research/SKILL.md');
  });

  test('lists and reads the built-in skill as a resource', async ({ mcp }) => {
    // The tester has no resources API yet, so use the underlying SDK client.
    const { resources } = await mcp.client.listResources();
    expect(resources.map((r) => r.uri)).toContain('skill://docs-research/SKILL.md');

    const { contents } = await mcp.client.readResource({ uri: 'skill://docs-research/SKILL.md' });
    expect((contents[0] as { text: string }).text).toContain('docs_search');
  });
});
