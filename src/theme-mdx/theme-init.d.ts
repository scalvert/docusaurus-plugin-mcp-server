// Resolved by Docusaurus at site build time: the MDXComponents of the theme
// this plugin's theme shadows.
declare module '@theme-init/MDXComponents' {
  const MDXComponents: Record<string, unknown>;
  export default MDXComponents;
}
