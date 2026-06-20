import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

const stub = (relativePath: string) => fileURLToPath(new URL(relativePath, import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      // Docusaurus build-time-only modules, stubbed so theme code runs under jsdom.
      '@theme/Icon/Copy': stub('./tests/__stubs__/ThemeIcon.tsx'),
      '@theme/Icon/Success': stub('./tests/__stubs__/ThemeIcon.tsx'),
      '@docusaurus/useGlobalData': stub('./tests/__stubs__/useGlobalData.ts'),
    },
  },
  test: {
    include: ['tests/**/*-test.{ts,tsx}', 'tests/**/*.test.{ts,tsx}'],
    environment: 'node',
    globals: true,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.d.ts', 'src/index.ts', 'src/adapters-entry.ts'],
      thresholds: {
        lines: 20,
      },
    },
  },
});
