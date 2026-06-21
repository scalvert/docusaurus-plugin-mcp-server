// Stub for Docusaurus `@docusaurus/useGlobalData`, which only resolves at
// Docusaurus build time. Aliased in vitest.config.ts so the theme hook can run
// under jsdom. The returned plugin data is controllable per test.
//
// ponytail: the stub only fakes runtime behavior. The real usePluginData
// *signature* is still typechecked where it matters — McpRegistryContext.tsx
// imports it from '@docusaurus/useGlobalData' (no alias under tsc), so a
// breaking API change fails `npm run typecheck` via the source, not here.
let pluginData: unknown = undefined;

/** Test helper: set what `usePluginData` returns on the next render. */
export function __setPluginData(data: unknown): void {
  pluginData = data;
}

export function usePluginData(_pluginName: string): unknown {
  return pluginData;
}
