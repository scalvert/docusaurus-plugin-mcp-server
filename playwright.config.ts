import { defineConfig } from '@playwright/test';

const TEST_PORT = 3457;

export default defineConfig({
  testDir: './tests/playwright',
  timeout: 30000,
  retries: 0,
  workers: 1, // Run tests serially since we're using a shared server

  reporter: [['html', { open: 'never' }], ['list']],

  // Start the test MCP server before running tests
  webServer: {
    command: 'node scripts/test-mcp-server.mjs',
    url: `http://localhost:${TEST_PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 30000,
  },

  projects: [
    {
      name: 'mcp-tests',
      use: {
        mcpConfig: {
          transport: 'http',
          serverUrl: `http://localhost:${TEST_PORT}`,
        },
      },
    },
  ],
});
