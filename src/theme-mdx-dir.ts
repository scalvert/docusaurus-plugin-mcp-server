import { fileURLToPath } from 'node:url';

/**
 * The directory of the plugin's Docusaurus theme (`src/theme-mdx` in source,
 * `dist/theme-mdx` when built). This module sits at the root of `src`, and is
 * bundled into the root of `dist`, so the same relative URL works in both.
 */
export const THEME_MDX_DIR = fileURLToPath(new URL('./theme-mdx', import.meta.url));
