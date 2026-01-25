/**
 * MCP Server Integration Tests using @gleanwork/mcp-server-tester
 *
 * These tests use the Playwright-based MCP testing framework to validate
 * our documentation MCP server implementation.
 *
 * The test server is started automatically via Playwright's webServer config.
 */

import { test, expect } from '@gleanwork/mcp-server-tester';

// ============================================================================
// MCP Protocol Conformance Tests
// ============================================================================

test.describe('MCP Protocol Conformance', () => {
  test('should return valid server info', async ({ mcp }) => {
    const info = mcp.getServerInfo();
    expect(info).toBeTruthy();
    expect(info?.name).toBe('test-docs');
    expect(info?.version).toBe('1.0.0');
  });

  test('should list available tools', async ({ mcp }) => {
    const tools = await mcp.listTools();
    expect(Array.isArray(tools)).toBe(true);
    expect(tools.length).toBe(3);

    const toolNames = tools.map((t) => t.name);
    expect(toolNames).toContain('docs_search');
    expect(toolNames).toContain('docs_get_page');
    expect(toolNames).toContain('docs_get_section');
  });

  test('should handle invalid tool gracefully', async ({ mcp }) => {
    const result = await mcp.callTool('nonexistent_tool', {});
    expect(result.isError).toBe(true);
  });
});

// ============================================================================
// docs_search Tool Tests
// ============================================================================

test.describe('docs_search Tool', () => {
  test('finds documents by title keywords', async ({ mcp }) => {
    const result = await mcp.callTool('docs_search', { query: 'introduction' });
    expect(result).toContainToolText('Introduction');
    expect(result).toContainToolText('/docs/intro');
  });

  test('finds documents by content', async ({ mcp }) => {
    const result = await mcp.callTool('docs_search', { query: 'OAuth' });
    expect(result).toContainToolText('Authentication');
    expect(result).toContainToolText('/docs/api/authentication');
  });

  test('respects limit parameter', async ({ mcp }) => {
    const result = await mcp.callTool('docs_search', { query: 'the', limit: 1 });
    expect(result).not.toBeToolError();
  });

  test('returns no results message for non-matching query', async ({ mcp }) => {
    const result = await mcp.callTool('docs_search', { query: 'xyznonexistent12345' });
    expect(result).toContainToolText('No matching documents found');
  });

  test('includes URLs when baseUrl is configured', async ({ mcp }) => {
    const result = await mcp.callTool('docs_search', { query: 'installation' });
    expect(result).toContainToolText('https://docs.example.com');
  });
});

// ============================================================================
// docs_get_page Tool Tests
// ============================================================================

test.describe('docs_get_page Tool', () => {
  test('retrieves full page content', async ({ mcp }) => {
    const result = await mcp.callTool('docs_get_page', { route: '/docs/intro' });
    expect(result).not.toBeToolError();
    expect(result).toContainToolText('Introduction');
    expect(result).toContainToolText('Welcome to the documentation');
  });

  test('returns page with markdown content', async ({ mcp }) => {
    const result = await mcp.callTool('docs_get_page', { route: '/docs/installation' });
    expect(result).toContainToolText('npm install my-platform');
  });

  test('returns error for non-existent page', async ({ mcp }) => {
    const result = await mcp.callTool('docs_get_page', { route: '/docs/nonexistent' });
    expect(result).toContainToolText('Page not found');
  });
});

// ============================================================================
// docs_get_section Tool Tests
// ============================================================================

test.describe('docs_get_section Tool', () => {
  test('retrieves specific section by heading ID', async ({ mcp }) => {
    const result = await mcp.callTool('docs_get_section', {
      route: '/docs/intro',
      headingId: 'overview',
    });
    expect(result).not.toBeToolError();
    // The section should contain content from the Overview heading
    expect(result).toContainToolText('Overview');
  });

  test('returns error for non-existent section', async ({ mcp }) => {
    const result = await mcp.callTool('docs_get_section', {
      route: '/docs/intro',
      headingId: 'nonexistent-section',
    });
    // The error message includes the heading id and lists available sections
    expect(result).toContainToolText('not found');
  });
});
