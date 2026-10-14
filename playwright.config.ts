import { defineConfig } from '@playwright/test';
import { protocolMatrix } from '@gleanwork/mcp-server-tester';

const TEST_PORT = 3457;

export default defineConfig({
  testDir: './tests/playwright',
  timeout: 30000,
  retries: 0,
  workers: 1, // Run tests serially since we're using a shared server

  reporter: [['html', { open: 'never' }], ['list']],

  // Snapshots are plain text, so share one baseline across platforms and
  // protocols (the default template appends the OS and project name).
  snapshotPathTemplate: '{testDir}/{testFileName}-snapshots/{arg}{ext}',

  // Start the test MCP server before running tests
  webServer: {
    command: 'node scripts/test-mcp-server.mjs',
    url: `http://localhost:${TEST_PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 30000,
  },

  // Every spec runs once per protocol: a 2025-era client (`initialize`) and a
  // 2026-07-28 client. The server serves both eras on one endpoint. Tests
  // tagged @once connect in both eras themselves, so they run only in the
  // first project instead of showing up as skipped in the second.
  projects: protocolMatrix(
    {
      name: 'mcp',
      use: {
        mcpConfig: {
          transport: 'http',
          serverUrl: `http://localhost:${TEST_PORT}`,
        },
      },
    },
    ['legacy', '2026-07-28']
  ).map((project, index) => (index === 0 ? project : { ...project, grepInvert: /@once/ })),
});
