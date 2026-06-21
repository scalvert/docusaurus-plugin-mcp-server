// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, renderHook, cleanup } from '@testing-library/react';
import {
  createDocsRegistryOptions,
  createDocsRegistry,
  useMcpRegistry,
} from '../src/theme/McpRegistryContext.js';
import { McpInstallButton } from '../src/theme/McpInstallButton.js';
import { __setPluginData } from './__stubs__/useGlobalData.js';

beforeEach(() => {
  __setPluginData(undefined);
  cleanup();
});

describe('registry helpers', () => {
  it('createDocsRegistryOptions derives the server name from config', () => {
    const opts = createDocsRegistryOptions({ serverUrl: 'https://x/mcp', serverName: 'my-docs' });
    const buildName = opts.serverNameBuilder as () => string;
    expect(buildName()).toBe('my-docs');
  });

  it('createDocsRegistry builds a registry that produces the correct CLI command', () => {
    const { registry, config } = createDocsRegistry({
      serverUrl: 'https://docs.example.com/mcp',
      serverName: 'my-docs',
    });
    expect(config).toEqual({ serverUrl: 'https://docs.example.com/mcp', serverName: 'my-docs' });

    const command = registry.createBuilder('claude-code').buildCommand({
      transport: 'http',
      serverUrl: config.serverUrl,
      serverName: config.serverName,
    });
    expect(command).toContain('claude mcp add my-docs');
    expect(command).toContain('https://docs.example.com/mcp');
  });
});

describe('useMcpRegistry', () => {
  it('returns undefined when the plugin has no global data', () => {
    __setPluginData(undefined);
    const { result } = renderHook(() => useMcpRegistry());
    expect(result.current).toBeUndefined();
  });

  it('returns a registry and config when plugin global data is present', () => {
    __setPluginData({ serverUrl: 'https://docs.example.com/mcp', serverName: 'my-docs' });
    const { result } = renderHook(() => useMcpRegistry());
    expect(result.current?.config).toEqual({
      serverUrl: 'https://docs.example.com/mcp',
      serverName: 'my-docs',
    });
    expect(result.current?.registry).toBeDefined();
  });
});

describe('McpInstallButton', () => {
  it('renders the trigger and lists client install commands from props', () => {
    render(
      <McpInstallButton
        serverUrl="https://docs.example.com/mcp"
        serverName="my-docs"
        label="Install MCP"
      />
    );
    expect(screen.getByRole('button', { name: 'Install MCP' })).toBeTruthy();
    expect(screen.getByText('Choose your AI tool:')).toBeTruthy();
    expect(screen.getAllByText(/claude mcp add my-docs/i).length).toBeGreaterThan(0);
  });

  it('toggles the dropdown open on click', () => {
    const { container } = render(
      <McpInstallButton
        serverUrl="https://docs.example.com/mcp"
        serverName="my-docs"
        label="Install MCP"
      />
    );
    expect(container.querySelector('.dropdown--show')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Install MCP' }));
    expect(container.querySelector('.dropdown--show')).not.toBeNull();
  });

  it('renders nothing when no server is configured via props or plugin', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { container } = render(<McpInstallButton />);
    expect(container.firstChild).toBeNull();
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });
});
