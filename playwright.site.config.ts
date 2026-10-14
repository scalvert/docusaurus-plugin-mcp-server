import { defineConfig } from '@playwright/test';
import { protocolMatrix } from '@gleanwork/mcp-server-tester';

const SITE_PORT = 3458;

/**
 * Contract tests for this repo's docs site, over its real MCP function
 * (website/api/mcp.mjs) on the built bundle. Build the site first:
 *
 *   npm run build && (cd website && npm ci && npm run build) && npm run test:site
 */
export default defineConfig({
  testDir: './tests/site',
  timeout: 60000,
  retries: 0,
  workers: 1,

  reporter: [['html', { open: 'never', outputFolder: 'playwright-report-site' }], ['list']],

  webServer: {
    command: 'node website/scripts/serve-mcp.mjs',
    env: { PORT: String(SITE_PORT) },
    url: `http://localhost:${SITE_PORT}/mcp`,
    reuseExistingServer: !process.env.CI,
    timeout: 30000,
  },

  projects: protocolMatrix(
    {
      name: 'site',
      use: {
        mcpConfig: {
          transport: 'http',
          serverUrl: `http://localhost:${SITE_PORT}/mcp`,
        },
      },
    },
    ['legacy', '2026-07-28']
  ),
});
