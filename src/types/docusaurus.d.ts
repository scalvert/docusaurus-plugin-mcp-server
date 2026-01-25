/**
 * Type declarations for Docusaurus client-side modules.
 * These modules are provided by Docusaurus at runtime via webpack aliases.
 */

declare module '@docusaurus/useGlobalData' {
  /**
   * Hook to get all global data from all plugins.
   */
  export function useAllPluginInstancesData<T = unknown>(pluginName: string): Record<string, T>;

  /**
   * Hook to get global data for a specific plugin instance.
   */
  export function usePluginData<T = unknown>(pluginName: string, pluginId?: string): T;

  /**
   * Hook to get all global data.
   */
  export default function useGlobalData(): Record<string, Record<string, unknown>>;
}
