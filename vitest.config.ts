import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*-test.ts', 'tests/**/*.test.ts'],
    environment: 'node',
    globals: true,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.d.ts', 'src/index.ts', 'src/adapters-entry.ts'],
    },
  },
});
