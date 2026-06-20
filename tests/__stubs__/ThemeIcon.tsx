// Stub for Docusaurus `@theme/Icon/*` modules, which only exist at Docusaurus
// build time. Aliased in vitest.config.ts so theme components can render in jsdom.
export default function ThemeIcon(props: Record<string, unknown>) {
  return <span data-testid="theme-icon" {...props} />;
}
