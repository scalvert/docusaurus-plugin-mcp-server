/**
 * MCP Server Integration Tests using @gleanwork/mcp-server-tester
 *
 * Protocol conformance and behavior that doesn't fit a tool check. Tool output
 * checks live in tool-checks.spec.ts + tool-checks.json.
 *
 * Each test runs once per protocol (playwright.config.ts): a 2025-era client,
 * which guards backward compatibility, and a 2026-07-28 client.
 *
 * The test server is started automatically via Playwright's webServer config.
 */

import {
  test,
  expect,
  getToolProtocolError,
  runConformanceChecks,
  runCrossEraChecks,
  validateSkillEntry,
  type ProtocolMatrixProject,
} from '@gleanwork/mcp-server-tester';

test.describe('MCP Protocol Conformance', () => {
  test('passes the tester conformance checks', async ({ mcp }, testInfo) => {
    // Includes the era's own rules and, since the server declares the skills
    // extension, the SEP-2640 checks (digests, sizes, frontmatter, -32602 for
    // unknown skills).
    const result = await runConformanceChecks(
      mcp,
      {
        requiredTools: ['docs_search', 'docs_fetch'],
        validateSchemas: true,
        skills: { verifyFiles: 'all' },
      },
      testInfo
    );

    const failed = result.checks.filter((c) => !c.pass && c.severity !== 'should');
    expect(failed, JSON.stringify(failed, null, 2)).toEqual([]);
    expect(result.pass).toBe(true);
    expect(result.raw.serverInfo).toMatchObject({ name: 'test-docs', version: '1.0.0' });
    expect(result.raw.tools).toHaveLength(2);
  });

  test('raises no conformance warnings', async ({ mcp }) => {
    // SHOULD-level failures don't fail result.pass; hold the server to them too.
    const result = await runConformanceChecks(mcp, { skills: { verifyFiles: 'all' } });
    const warnings = result.checks.filter((c) => !c.pass && !c.skipped);
    expect(warnings, JSON.stringify(warnings, null, 2)).toEqual([]);
  });

  test('tools are annotated read-only', async ({ mcp }) => {
    const tools = await mcp.listTools();
    for (const tool of tools) {
      expect(tool.annotations, tool.name).toMatchObject({ readOnlyHint: true });
    }
  });

  test('rejects an unknown tool with a JSON-RPC invalid-params error', async ({ mcp }) => {
    // MCP SDK v2: unknown tools are a protocol error (-32602), not an isError
    // result. MST folds it into an error-shaped result.
    const result = await mcp.callTool('nonexistent_tool', {});
    expect(result).toBeToolError();
    expect(getToolProtocolError(result)).toMatchObject({ code: -32602 });
  });
});

test.describe('Skills', () => {
  test('points to skills in instructions', async ({ mcp }) => {
    // 2025-era clients drop the capabilities `extensions` field, so the
    // instructions pointer is how they discover skills.
    expect(mcp.client.getInstructions()).toContain('skill://docs-research/SKILL.md');
  });

  test('serves the built-in skill over the skills extension', async ({ mcp }) => {
    expect(mcp.skills.supported()).toBe(true);

    const entries = await mcp.skills.list();
    expect(entries.map((entry) => entry.frontmatter.name)).toContain('docs-research');
    for (const entry of entries) {
      expect(validateSkillEntry(entry).filter((p) => p.severity === 'must')).toEqual([]);
    }

    const skill = await mcp.skills.read('skill://docs-research/SKILL.md');
    expect(skill.verified).toBe(true);
    expect(skill.text).toContain('docs_search');
  });

  test('lists and reads the built-in skill as a resource', async ({ mcp }) => {
    const resources = await mcp.listResources();
    expect(resources.map((r) => r.uri)).toContain('skill://docs-research/SKILL.md');

    const { contents } = await mcp.readResource('skill://docs-research/SKILL.md');
    expect((contents[0] as { text: string }).text).toContain('docs_search');
  });
});

test.describe('Protocol eras', () => {
  // Connects once per era itself, so it runs in one project only (@once,
  // playwright.config.ts).
  test('legacy and 2026-07-28 clients see the same server', { tag: '@once' }, async () => {
    const testInfo = test.info();
    // The server this project uses (playwright.config.ts).
    const { mcpConfig } = testInfo.project.use as NonNullable<ProtocolMatrixProject['use']>;
    const result = await runCrossEraChecks(mcpConfig!, {}, testInfo);
    const failed = result.checks.filter((c) => !c.pass);
    expect(failed, JSON.stringify(failed, null, 2)).toEqual([]);
  });

  test('negotiates the protocol it asked for', async ({ mcp }) => {
    const { requested, negotiated, era } = mcp.protocol;
    expect(era).toBe(requested === '2026-07-28' ? 'modern' : 'legacy');
    if (requested === '2026-07-28') expect(negotiated).toBe('2026-07-28');
  });
});
