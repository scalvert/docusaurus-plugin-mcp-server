// The plugin's Docusaurus theme (`getThemePath`): one component,
// `@theme/MDXComponents`, that adds the plugin's components to the theme's
// own, so MDX pages can use them without an import. `@theme-init` is the
// MDXComponents of the theme loaded before this plugin (the classic theme).
//
// The build keeps the components import external, pointed at the built
// `dist/theme/index.js` (tsup.config.ts), so pages that import the components
// from `docusaurus-plugin-mcp-server/theme` get the same module.
import MDXComponents from '@theme-init/MDXComponents';
import { mdxComponents } from '../theme/mdx-components.js';

export default {
  ...MDXComponents,
  ...mdxComponents,
};
