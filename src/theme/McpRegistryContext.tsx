import { useMemo } from 'react';
import { usePluginData } from '@docusaurus/useGlobalData';
import { MCPConfigRegistry, type RegistryOptions } from '@gleanwork/mcp-config-schema/browser';

/**
 * Configuration from the plugin
 */
export interface McpConfig {
  /** Full URL to the MCP server endpoint */
  serverUrl: string;
  /** Name of the MCP server for configuration */
  serverName: string;
}

/**
 * Plugin global data shape
 */
interface McpPluginGlobalData {
  serverUrl: string;
  serverName: string;
}

/**
 * Registry options for the docs MCP server.
 * Similar to GLEAN_REGISTRY_OPTIONS in @gleanwork/mcp-config-glean
 */
export function createDocsRegistryOptions(config: McpConfig): RegistryOptions {
  return {
    // Use the serverName from config for naming
    serverNameBuilder: () => config.serverName,
  };
}

/**
 * Creates an MCPConfigRegistry pre-configured with the docs server settings.
 *
 * Similar to createGleanRegistry() from @gleanwork/mcp-config-glean
 *
 * @param config - The server configuration from plugin
 * @returns Object with registry instance and bound config
 */
export function createDocsRegistry(config: McpConfig): {
  registry: MCPConfigRegistry;
  config: McpConfig;
} {
  const options = createDocsRegistryOptions(config);
  return {
    registry: new MCPConfigRegistry(options),
    config,
  };
}

/**
 * Hook to access the pre-configured MCP registry and config.
 *
 * Reads configuration from plugin globalData and creates a registry
 * with the serverUrl and serverName pre-bound in the config object.
 *
 * @returns { registry, config } or undefined if plugin not configured
 *
 * @example
 * ```tsx
 * function MyComponent() {
 *   const mcp = useMcpRegistry();
 *   if (!mcp) return null;
 *
 *   const { registry, config } = mcp;
 *   const builder = registry.createBuilder('claude-code');
 *   const json = builder.buildConfiguration({
 *     transport: 'http',
 *     serverUrl: config.serverUrl,
 *     serverName: config.serverName,
 *   });
 * }
 * ```
 */
export function useMcpRegistry(): { registry: MCPConfigRegistry; config: McpConfig } | undefined {
  // Read plugin globalData
  let pluginData: McpPluginGlobalData | undefined;
  try {
    pluginData = usePluginData('docusaurus-plugin-mcp-server') as McpPluginGlobalData | undefined;
  } catch {
    // Plugin not installed
    return undefined;
  }

  // Memoize registry creation
  const result = useMemo(() => {
    if (!pluginData?.serverUrl || !pluginData?.serverName) {
      return undefined;
    }
    const config: McpConfig = {
      serverUrl: pluginData.serverUrl,
      serverName: pluginData.serverName,
    };
    return createDocsRegistry(config);
  }, [pluginData?.serverUrl, pluginData?.serverName]);

  return result;
}

export default useMcpRegistry;
