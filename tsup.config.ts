import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    'adapters-entry': 'src/adapters-entry.ts',
    'adapters-node': 'src/adapters-node.ts',
    'theme/index': 'src/theme/index.ts',
    'cli/verify': 'src/cli/verify.ts',
  },
  format: ['esm'],
  dts: true,
  clean: true,
  sourcemap: true,
  splitting: false,
  treeshake: true,
  outDir: 'dist',
  // Keep `node:` on built-in imports. Edge bundlers (Workers, Vercel Edge)
  // recognize only the prefixed form, and tsup strips it by default, so the
  // file-mode `import('node:fs/promises')` would otherwise break their build.
  removeNodeProtocol: false,
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
