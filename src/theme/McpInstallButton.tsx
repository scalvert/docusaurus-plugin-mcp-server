import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import {
  MCPConfigRegistry,
  type ClientId,
  type MCPClientConfig,
} from '@gleanwork/mcp-config-schema/browser';
import { useMcpRegistry, createDocsRegistry, type McpConfig } from './McpRegistryContext.js';

/**
 * Props for the McpInstallButton component
 */
export interface McpInstallButtonProps {
  /** Server URL. If not provided, uses plugin configuration. */
  serverUrl?: string;
  /** Server name. If not provided, uses plugin configuration. */
  serverName?: string;
  /** Button label (default: "Install MCP") */
  label?: string;
  /** Optional className for styling */
  className?: string;
  /** Clients to show. Defaults to all HTTP-capable clients from registry. */
  clients?: ClientId[];
}

/**
 * A dropdown button component for installing MCP servers in various AI tools.
 *
 * @example
 * ```tsx
 * <McpInstallButton
 *   serverUrl="https://docs.example.com/mcp"
 *   serverName="my-docs"
 * />
 * ```
 */
export function McpInstallButton({
  serverUrl: serverUrlProp,
  serverName: serverNameProp,
  label = 'Install MCP',
  className = '',
  clients: clientsProp,
}: McpInstallButtonProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [copiedClient, setCopiedClient] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Get pre-configured registry from plugin
  const pluginMcp = useMcpRegistry();

  // Use props if provided, otherwise fall back to plugin config
  const { registry, config } = useMemo(() => {
    // If explicit props provided, create a new registry with those values
    if (serverUrlProp && serverNameProp) {
      return createDocsRegistry({
        serverUrl: serverUrlProp,
        serverName: serverNameProp,
      });
    }
    // Otherwise use plugin-provided registry
    if (pluginMcp) {
      return pluginMcp;
    }
    // Fallback: create registry without bound config (will fail validation below)
    return {
      registry: new MCPConfigRegistry(),
      config: { serverUrl: '', serverName: '' } as McpConfig,
    };
  }, [serverUrlProp, serverNameProp, pluginMcp]);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Validate configuration
  if (!config.serverUrl || !config.serverName) {
    console.error(
      '[McpInstallButton] Missing serverUrl or serverName. ' +
      'Either pass them as props or configure the docusaurus-plugin-mcp-server plugin.'
    );
    return null;
  }

  // Get clients to display - dynamic from registry
  const clientConfigs = useMemo(() => {
    if (clientsProp) {
      return clientsProp
        .map((id) => registry.getConfig(id))
        .filter((c): c is MCPClientConfig => c !== undefined);
    }
    // Get all HTTP-capable clients dynamically
    return registry.getNativeHttpClients();
  }, [registry, clientsProp]);

  const copyToClipboard = useCallback(async (text: string, clientId: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedClient(clientId);
      setTimeout(() => setCopiedClient(null), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  }, []);

  const getConfigForClient = useCallback(
    (clientId: ClientId): string => {
      const builder = registry.createBuilder(clientId);
      const clientConfig = builder.buildConfiguration({
        transport: 'http',
        serverUrl: config.serverUrl,
        serverName: config.serverName,
      });
      return JSON.stringify(clientConfig, null, 2);
    },
    [registry, config.serverUrl, config.serverName]
  );

  const getCommandForClient = useCallback(
    (clientId: ClientId): string | null => {
      const builder = registry.createBuilder(clientId);
      const cliStatus = builder.supportsCliInstallation();
      if (!cliStatus.supported) {
        return null;
      }
      return builder.buildCommand({
        transport: 'http',
        serverUrl: config.serverUrl,
        serverName: config.serverName,
      });
    },
    [registry, config.serverUrl, config.serverName]
  );

  return (
    <div ref={dropdownRef} className={`mcp-install-button ${className}`} style={styles.container}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        style={styles.button}
        aria-expanded={isOpen}
        aria-haspopup="true"
      >
        {label}
        <span style={styles.caret}>{isOpen ? '▲' : '▼'}</span>
      </button>

      {isOpen && (
        <div style={styles.dropdown}>
          <div style={styles.dropdownHeader}>Choose your AI tool:</div>

          {clientConfigs.map((client) => {
            const command = getCommandForClient(client.id);
            const config = getConfigForClient(client.id);
            const isCopied = copiedClient === client.id;

            return (
              <div key={client.id} style={styles.clientSection}>
                <div style={styles.clientHeader}>
                  <span style={styles.clientName}>{client.displayName}</span>
                </div>

                {command ? (
                  <div style={styles.codeBlock}>
                    <code style={styles.code}>{command}</code>
                    <button
                      onClick={() => copyToClipboard(command, client.id)}
                      style={styles.copyButton}
                      title="Copy to clipboard"
                    >
                      {isCopied ? '✓' : '📋'}
                    </button>
                  </div>
                ) : (
                  <div style={styles.codeBlock}>
                    <pre style={styles.pre}>
                      <code style={styles.code}>{config}</code>
                    </pre>
                    <button
                      onClick={() => copyToClipboard(config, client.id)}
                      style={styles.copyButton}
                      title="Copy to clipboard"
                    >
                      {isCopied ? '✓' : '📋'}
                    </button>
                  </div>
                )}

                {client.localConfigNotes && (
                  <div style={styles.notes}>{client.localConfigNotes}</div>
                )}
              </div>
            );
          })}

          <div style={styles.footer}>
            <a
              href="https://modelcontextprotocol.io/"
              target="_blank"
              rel="noopener noreferrer"
              style={styles.learnMore}
            >
              Learn more about MCP →
            </a>
          </div>
        </div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    position: 'relative',
    display: 'inline-block',
  },
  button: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
    padding: '8px 16px',
    fontSize: '14px',
    fontWeight: 500,
    color: '#fff',
    backgroundColor: '#5B4DC7',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    transition: 'background-color 0.2s',
  },
  caret: {
    fontSize: '10px',
  },
  dropdown: {
    position: 'absolute',
    top: '100%',
    right: 0,
    marginTop: '8px',
    width: '380px',
    maxHeight: '70vh',
    overflowY: 'auto',
    backgroundColor: '#fff',
    borderRadius: '8px',
    boxShadow: '0 4px 20px rgba(0, 0, 0, 0.15)',
    zIndex: 1000,
  },
  dropdownHeader: {
    padding: '12px 16px',
    fontSize: '13px',
    fontWeight: 600,
    color: '#666',
    borderBottom: '1px solid #eee',
  },
  clientSection: {
    padding: '12px 16px',
    borderBottom: '1px solid #eee',
  },
  clientHeader: {
    display: 'flex',
    alignItems: 'center',
    marginBottom: '8px',
  },
  clientName: {
    fontSize: '14px',
    fontWeight: 600,
    color: '#333',
  },
  codeBlock: {
    position: 'relative',
    backgroundColor: '#f6f8fa',
    borderRadius: '6px',
    padding: '10px 40px 10px 12px',
  },
  pre: {
    margin: 0,
    fontSize: '12px',
    lineHeight: 1.4,
    overflow: 'auto',
    maxHeight: '120px',
  },
  code: {
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
    fontSize: '12px',
    color: '#24292f',
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-all',
  },
  copyButton: {
    position: 'absolute',
    top: '8px',
    right: '8px',
    padding: '4px 8px',
    fontSize: '14px',
    backgroundColor: 'transparent',
    border: 'none',
    cursor: 'pointer',
    opacity: 0.6,
    transition: 'opacity 0.2s',
  },
  notes: {
    marginTop: '8px',
    fontSize: '11px',
    color: '#666',
    fontStyle: 'italic',
  },
  footer: {
    padding: '12px 16px',
    textAlign: 'center',
  },
  learnMore: {
    fontSize: '12px',
    color: '#5B4DC7',
    textDecoration: 'none',
  },
};

export default McpInstallButton;
