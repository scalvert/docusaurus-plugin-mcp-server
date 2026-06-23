import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

const at = (relativePath: string) => fileURLToPath(new URL(relativePath, import.meta.url));

export default defineConfig({
  resolve: {
    alias: [
      // Docusaurus build-time-only modules, stubbed so theme code runs under jsdom.
      { find: '@theme/Icon/Copy', replacement: at('./tests/__stubs__/ThemeIcon.tsx') },
      { find: '@theme/Icon/Success', replacement: at('./tests/__stubs__/ThemeIcon.tsx') },
      { find: '@docusaurus/useGlobalData', replacement: at('./tests/__stubs__/useGlobalData.ts') },
      // Resolve the package's own entry points to src so README snippets can be
      // imported in tests — a documented symbol that isn't exported then throws.
      { find: /^docusaurus-plugin-mcp-server$/, replacement: at('./src/index.ts') },
      {
        find: /^docusaurus-plugin-mcp-server\/adapters$/,
        replacement: at('./src/adapters-entry.ts'),
      },
      {
        find: /^docusaurus-plugin-mcp-server\/adapters\/node$/,
        replacement: at('./src/adapters-node.ts'),
      },
      { find: /^docusaurus-plugin-mcp-server\/theme$/, replacement: at('./src/theme/index.ts') },
    ],
  },
  test: {
    include: ['tests/**/*-test.{ts,tsx}', 'tests/**/*.test.{ts,tsx}'],
    environment: 'node',
    globals: true,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.d.ts', 'src/index.ts', 'src/adapters-entry.ts', 'src/adapters-node.ts'],
      thresholds: {
        lines: 50,
        'src/adapters/**': { lines: 85, functions: 90 },
        'src/mcp/**': { lines: 70 },
      },
    },
  },
});
