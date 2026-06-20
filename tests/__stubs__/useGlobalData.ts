// Stub for Docusaurus `@docusaurus/useGlobalData`, which only resolves at
// Docusaurus build time. Aliased in vitest.config.ts so the theme hook can run
// under jsdom. The returned plugin data is controllable per test.
let pluginData: unknown = undefined;

/** Test helper: set what `usePluginData` returns on the next render. */
export function __setPluginData(data: unknown): void {
  pluginData = data;
}

export function usePluginData(_pluginName: string): unknown {
  return pluginData;
}
