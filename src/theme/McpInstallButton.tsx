import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import {
  MCPConfigRegistry,
  type ClientId,
  type MCPClientConfig,
} from '@gleanwork/mcp-config-schema/browser';
import IconCopy from '@theme/Icon/Copy';
import IconSuccess from '@theme/Icon/Success';
import { useMcpRegistry, createDocsRegistry, type McpConfig } from './McpRegistryContext.js';

/**
 * MCP Logo icon - extracted from official MCP branding
 */
function IconMcp({ size = 16 }: { size?: number }) {
  return (
    <svg
      viewBox="0 0 170 195"
      width={size}
      height={size}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      style={{ display: 'block' }}
    >
      <path
        d="M25 97.8528L92.8823 29.9706C102.255 20.598 117.451 20.598 126.823 29.9706C136.196 39.3431 136.196 54.5391 126.823 63.9117L75.5581 115.177"
        stroke="currentColor"
        strokeWidth="12"
        strokeLinecap="round"
      />
      <path
        d="M76.2653 114.47L126.823 63.9117C136.196 54.5391 151.392 54.5391 160.765 63.9117L161.118 64.2652C170.491 73.6378 170.491 88.8338 161.118 98.2063L99.7248 159.6C96.6006 162.724 96.6006 167.789 99.7248 170.913L112.331 183.52"
        stroke="currentColor"
        strokeWidth="12"
        strokeLinecap="round"
      />
      <path
        d="M109.853 46.9411L59.6482 97.1457C50.2757 106.518 50.2757 121.714 59.6482 131.087C69.0208 140.459 84.2168 140.459 93.5894 131.087L143.794 80.8822"
        stroke="currentColor"
        strokeWidth="12"
        strokeLinecap="round"
      />
    </svg>
  );
}

/**
 * Chevron icon for dropdown
 */
function IconChevron({ isOpen }: { isOpen: boolean }) {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 12 12"
      style={{
        display: 'block',
        transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)',
        transition: 'transform var(--ifm-transition-fast)',
      }}
    >
      <path
        d="M2.5 4.5L6 8L9.5 4.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  );
}

/**
 * External link icon
 */
function IconExternalLink() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" style={{ display: 'block', marginLeft: '4px' }}>
      <path
        fill="currentColor"
        d="M3.5 3C3.22386 3 3 3.22386 3 3.5C3 3.77614 3.22386 4 3.5 4H7.29289L3.14645 8.14645C2.95118 8.34171 2.95118 8.65829 3.14645 8.85355C3.34171 9.04882 3.65829 9.04882 3.85355 8.85355L8 4.70711V8.5C8 8.77614 8.22386 9 8.5 9C8.77614 9 9 8.77614 9 8.5V3.5C9 3.22386 8.77614 3 8.5 3H3.5Z"
      />
    </svg>
  );
}

/**
 * Code block with integrated copy button
 */
function CodeBlock({
  code,
  isMultiline = false,
  isCopied,
  onCopy,
}: {
  code: string;
  isMultiline?: boolean;
  isCopied: boolean;
  onCopy: () => void;
}) {
  return (
    <div className="mcp-code-block">
      <div className="mcp-code-block__content">
        {isMultiline ? (
          <pre className="mcp-code-block__pre">
            <code>{code}</code>
          </pre>
        ) : (
          <code>{code}</code>
        )}
      </div>
      <button
        className="mcp-code-block__copy"
        onClick={onCopy}
        title={isCopied ? 'Copied!' : 'Copy to clipboard'}
        aria-label={isCopied ? 'Copied' : 'Copy to clipboard'}
      >
        {isCopied ? (
          <IconSuccess className="mcp-code-block__icon mcp-code-block__icon--success" />
        ) : (
          <IconCopy className="mcp-code-block__icon" />
        )}
      </button>
    </div>
  );
}

/**
 * Props for the McpInstallButton component
 */
export interface McpInstallButtonProps {
  /** Server URL. If not provided, uses plugin configuration. */
  serverUrl?: string;
  /** Server name. If not provided, uses plugin configuration. */
  serverName?: string;
  /** Button label (default: "Install docs MCP") */
  label?: string;
  /** Optional className for styling */
  className?: string;
  /** Clients to show. Defaults to all HTTP-capable clients from registry. */
  clients?: ClientId[];
}

/**
 * A dropdown button component for installing MCP servers in various AI tools.
 * Uses Docusaurus/Infima CSS classes for consistent theming.
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
  label = 'Install docs MCP',
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
    if (serverUrlProp && serverNameProp) {
      return createDocsRegistry({
        serverUrl: serverUrlProp,
        serverName: serverNameProp,
      });
    }
    if (pluginMcp) {
      return pluginMcp;
    }
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

  // Get clients to display - dynamic from registry, sorted alphabetically
  const clientConfigs = useMemo(() => {
    let clients: MCPClientConfig[];
    if (clientsProp) {
      clients = clientsProp
        .map((id) => registry.getConfig(id))
        .filter((c): c is MCPClientConfig => c !== undefined);
    } else {
      clients = registry.getNativeHttpClients();
    }
    // Sort alphabetically by display name
    return clients.sort((a, b) => a.displayName.localeCompare(b.displayName));
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
    (clientId: ClientId): string | null => {
      try {
        const builder = registry.createBuilder(clientId);
        const clientConfig = builder.buildConfiguration({
          transport: 'http',
          serverUrl: config.serverUrl,
          serverName: config.serverName,
        });
        return JSON.stringify(clientConfig, null, 2);
      } catch {
        // Client doesn't support local configuration
        return null;
      }
    },
    [registry, config.serverUrl, config.serverName]
  );

  const getCommandForClient = useCallback(
    (clientId: ClientId): string | null => {
      try {
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
      } catch {
        return null;
      }
    },
    [registry, config.serverUrl, config.serverName]
  );

  // Using Infima dropdown classes
  const dropdownClasses = [
    'dropdown',
    'dropdown--right',
    isOpen ? 'dropdown--show' : '',
    'mcp-install-dropdown',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div ref={dropdownRef} className={dropdownClasses}>
      {/* Infima button classes */}
      <button
        className="button button--primary mcp-install-dropdown__button"
        onClick={() => setIsOpen(!isOpen)}
        aria-expanded={isOpen}
        aria-haspopup="true"
      >
        <IconMcp size={16} />
        <span>{label}</span>
        <IconChevron isOpen={isOpen} />
      </button>

      {/* Dropdown menu using Infima classes */}
      <ul className="dropdown__menu mcp-install-dropdown__menu">
        <li className="mcp-install-dropdown__header">Choose your AI tool:</li>

        {clientConfigs.map((client) => {
          const command = getCommandForClient(client.id);
          const clientConfig = getConfigForClient(client.id);
          const isCopied = copiedClient === client.id;

          if (!command && !clientConfig) {
            return null;
          }

          return (
            <li key={client.id} className="mcp-install-dropdown__item">
              <div className="mcp-install-dropdown__client-header">
                <span className="mcp-install-dropdown__client-name">{client.displayName}</span>
                {command && <span className="badge badge--success">CLI</span>}
              </div>

              {command ? (
                <CodeBlock
                  code={command}
                  isCopied={isCopied}
                  onCopy={() => copyToClipboard(command, client.id)}
                />
              ) : clientConfig ? (
                <CodeBlock
                  code={clientConfig}
                  isMultiline
                  isCopied={isCopied}
                  onCopy={() => copyToClipboard(clientConfig, client.id)}
                />
              ) : null}

              {client.localConfigNotes && (
                <p className="mcp-install-dropdown__notes">{client.localConfigNotes}</p>
              )}
            </li>
          );
        })}

        <li className="mcp-install-dropdown__footer">
          <a
            href="https://modelcontextprotocol.io/"
            target="_blank"
            rel="noopener noreferrer"
            className="mcp-install-dropdown__learn-more"
          >
            Learn more about MCP
            <IconExternalLink />
          </a>
        </li>
      </ul>

      {/* Scoped styles using CSS variables for customization */}
      <style>{`
        .mcp-install-dropdown {
          --mcp-dropdown-width: 520px;
          /* Always use dark code blocks for consistency across themes */
          --mcp-code-bg: #1e1e1e;
          --mcp-code-color: #e5e7eb;
        }

        .mcp-install-dropdown__button {
          display: inline-flex;
          align-items: center;
          gap: 0.5rem;
        }

        .mcp-install-dropdown__menu {
          width: var(--mcp-dropdown-width);
          padding: 0;
          top: calc(100% + 0.25rem);
        }

        .mcp-install-dropdown__header {
          padding: 0.75rem 1rem;
          font-size: var(--ifm-font-size-small);
          font-weight: var(--ifm-font-weight-semibold);
          color: var(--ifm-color-secondary-darkest);
          background-color: var(--ifm-background-color);
          border-bottom: 1px solid var(--ifm-toc-border-color);
        }

        .mcp-install-dropdown__item {
          padding: 0.875rem 1rem;
          border-bottom: 1px solid var(--ifm-toc-border-color);
        }

        .mcp-install-dropdown__client-header {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          margin-bottom: 0.625rem;
        }

        .mcp-install-dropdown__client-name {
          font-weight: var(--ifm-font-weight-semibold);
          color: var(--ifm-font-color-base);
        }

        .mcp-install-dropdown__notes {
          margin: 0.5rem 0 0;
          font-size: var(--ifm-font-size-small);
          color: var(--ifm-color-secondary-darkest);
          line-height: 1.4;
        }

        .mcp-install-dropdown__footer {
          padding: 0.75rem 1rem;
          text-align: center;
          background-color: var(--ifm-background-color);
        }

        .mcp-install-dropdown__learn-more {
          display: inline-flex;
          align-items: center;
          font-size: var(--ifm-font-size-small);
          font-weight: var(--ifm-font-weight-semibold);
          color: var(--ifm-color-primary);
          text-decoration: none;
        }

        .mcp-install-dropdown__learn-more:hover {
          color: var(--ifm-color-primary-dark);
          text-decoration: none;
        }

        /* Code block styles */
        .mcp-code-block {
          display: flex;
          border-radius: var(--ifm-code-border-radius, 0.25rem);
          overflow: hidden;
        }

        .mcp-code-block__content {
          flex: 1;
          background-color: var(--mcp-code-bg);
          padding: 0.75rem 1rem;
          overflow-x: auto;
        }

        .mcp-code-block__content code {
          font-family: var(--ifm-font-family-monospace);
          font-size: var(--ifm-code-font-size);
          color: var(--mcp-code-color);
          background: none;
          padding: 0;
          border: none;
          white-space: nowrap;
        }

        .mcp-code-block__pre {
          margin: 0;
          background: none;
          max-height: 120px;
          overflow-y: auto;
        }

        .mcp-code-block__pre code {
          white-space: pre;
        }

        .mcp-code-block__copy {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 2.75rem;
          background-color: var(--ifm-color-gray-800, #374151);
          border: none;
          cursor: pointer;
          color: var(--ifm-color-gray-400, #9ca3af);
          transition: background-color var(--ifm-transition-fast);
        }

        .mcp-code-block__copy:hover {
          background-color: var(--ifm-color-gray-700, #4b5563);
        }

        .mcp-code-block__icon {
          width: 16px;
          height: 16px;
          display: block;
        }

        .mcp-code-block__icon--success {
          color: var(--ifm-color-success, #22c55e);
        }
      `}</style>
    </div>
  );
}

export default McpInstallButton;
