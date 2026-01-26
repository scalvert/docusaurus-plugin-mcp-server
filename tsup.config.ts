import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    'adapters-entry': 'src/adapters-entry.ts',
    'theme/index': 'src/theme/index.ts',
    'cli/verify': 'src/cli/verify.ts',
  },
  format: ['cjs', 'esm'],
  dts: true,
  clean: true,
  sourcemap: true,
  splitting: false,
  treeshake: true,
  outDir: 'dist',
  external: [
    'react',
    'react-dom',
    '@docusaurus/useGlobalData',
    /^@theme\//, // Docusaurus theme aliases resolved at runtime
    /^node:/, // Node.js built-in modules with node: prefix
    'http', // Node.js http module (used by node adapter)
    'fs',
    'path',
  ],
});
