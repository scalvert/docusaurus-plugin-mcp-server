import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  MCPConfigRegistry,
  type ClientId,
  type MCPClientConfig,
} from '@gleanwork/mcp-config-schema/browser';

/**
 * Props for the McpInstallButton component
 */
export interface McpInstallButtonProps {
  /** The URL of your MCP server endpoint */
  serverUrl: string;
  /** The name of your MCP server (used in configs) */
  serverName: string;
  /** Button label (default: "Install MCP") */
  label?: string;
  /** Optional className for styling */
  className?: string;
  /** Clients to show (default: shows all HTTP-capable clients) */
  clients?: ClientId[];
}

/**
 * Supported clients that work well with HTTP servers
 */
const DEFAULT_CLIENTS: ClientId[] = [
  'claude-code',
  'cursor',
  'vscode',
  'windsurf',
  'claude-desktop',
];

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
  serverUrl,
  serverName,
  label = 'Install MCP',
  className = '',
  clients = DEFAULT_CLIENTS,
}: McpInstallButtonProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [copiedClient, setCopiedClient] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const registry = useRef(new MCPConfigRegistry()).current;

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

  // Get client configs
  const clientConfigs = clients
    .map((id) => registry.getConfig(id))
    .filter((config): config is MCPClientConfig => config !== undefined);

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
      const config = builder.buildConfiguration({
        serverName,
        serverUrl,
        transport: 'http',
      });
      return JSON.stringify(config, null, 2);
    },
    [registry, serverName, serverUrl]
  );

  const getCommandForClient = useCallback(
    (clientId: ClientId): string | null => {
      if (clientId === 'claude-code') {
        return `claude mcp add --transport http ${serverName} ${serverUrl}`;
      }
      return null;
    },
    [serverName, serverUrl]
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
