import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    'adapters-entry': 'src/adapters-entry.ts',
    'adapters-node': 'src/adapters-node.ts',
    'theme/index': 'src/theme/index.ts',
    'cli/verify': 'src/cli/verify.ts',
    // The plugin's Docusaurus theme (getThemePath): the directory must hold
    // only theme components.
    'theme-mdx/MDXComponents': 'src/theme-mdx/MDXComponents.ts',
  },
  esbuildPlugins: [
    {
      // The theme's MDXComponents imports the components from the built theme
      // entry rather than bundling its own copy, so a page that imports them
      // from 'docusaurus-plugin-mcp-server/theme' gets the same module.
      name: 'theme-mdx-components-external',
      setup(build) {
        build.onResolve({ filter: /^\.\.\/theme\/mdx-components\.js$/ }, (args) =>
          args.importer.includes('theme-mdx')
            ? { path: '../theme/index.js', external: true }
            : undefined
        );
      },
    },
  ],
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
    /^@theme-init\//, // the theme component this plugin's theme shadows
    /^node:/, // Node.js built-in modules with node: prefix
    'http', // Node.js http module (used by node adapter)
    'fs',
    'path',
  ],
});
