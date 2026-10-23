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

  function renderOpen() {
    const utils = render(
      <div>
        <McpInstallButton
          serverUrl="https://docs.example.com/mcp"
          serverName="my-docs"
          label="Install MCP"
        />
        <a href="#elsewhere">Elsewhere</a>
      </div>
    );
    const trigger = screen.getByRole('button', { name: 'Install MCP' });
    fireEvent.click(trigger);
    expect(utils.container.querySelector('.dropdown--show')).not.toBeNull();
    return { ...utils, trigger };
  }

  function firstCopyButton(): HTMLElement {
    const [button] = screen.getAllByRole('button', { name: 'Copy to clipboard' });
    if (!button) throw new Error('expected a copy button in the open dropdown');
    return button;
  }

  it('closes on Escape and returns focus to the trigger', () => {
    const { container, trigger } = renderOpen();
    const copyButton = firstCopyButton();
    copyButton.focus();

    fireEvent.keyDown(copyButton, { key: 'Escape' });

    expect(container.querySelector('.dropdown--show')).toBeNull();
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(trigger);
  });

  it('closes on Escape when focus is outside the dropdown', () => {
    // Safari doesn't focus a button on click, so after a mouse open the key
    // event comes from the body, not from inside the dropdown.
    const { container, trigger } = renderOpen();
    trigger.blur();

    fireEvent.keyDown(document.body, { key: 'Escape' });

    expect(container.querySelector('.dropdown--show')).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it('ignores Escape while closed', () => {
    const { container, trigger } = renderOpen();
    fireEvent.click(trigger);
    const outside = screen.getByText('Elsewhere');
    outside.focus();

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(container.querySelector('.dropdown--show')).toBeNull();
    expect(document.activeElement).toBe(outside);
  });

  it('closes when focus moves outside the dropdown', () => {
    const { container } = renderOpen();

    fireEvent.focusIn(screen.getByText('Elsewhere'));

    expect(container.querySelector('.dropdown--show')).toBeNull();
  });

  it('stays open when focus moves within the dropdown', () => {
    const { container } = renderOpen();

    fireEvent.focusIn(firstCopyButton());

    expect(container.querySelector('.dropdown--show')).not.toBeNull();
  });

  it('stays open when a copy button is pressed or touched', () => {
    const { container } = renderOpen();

    fireEvent.mouseDown(firstCopyButton());
    fireEvent.touchStart(firstCopyButton());

    expect(container.querySelector('.dropdown--show')).not.toBeNull();
  });

  it('closes on a touch outside the dropdown', () => {
    const { container } = renderOpen();

    fireEvent.touchStart(screen.getByText('Elsewhere'));

    expect(container.querySelector('.dropdown--show')).toBeNull();
  });

  it('closes on a mouse press outside the dropdown', () => {
    const { container } = renderOpen();

    fireEvent.mouseDown(screen.getByText('Elsewhere'));

    expect(container.querySelector('.dropdown--show')).toBeNull();
  });

  function renderWithOnCopy(onCopy: (event: unknown) => void) {
    const utils = render(
      <McpInstallButton
        serverUrl="https://docs.example.com/mcp"
        serverName="my-docs"
        label="Install MCP"
        clients={['claude-code', 'cursor']}
        onCopy={onCopy}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Install MCP' }));
    const copyButtonFor = (clientName: string): HTMLElement => {
      const item = screen.getByText(clientName).closest('li');
      const button = item?.querySelector<HTMLElement>('.mcp-code-block__copy');
      if (!button) throw new Error(`expected a copy button for ${clientName}`);
      return button;
    };
    return { ...utils, copyButtonFor };
  }

  it('reports a copied CLI command or config to onCopy', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    const onCopy = vi.fn();
    const { copyButtonFor } = renderWithOnCopy(onCopy);

    fireEvent.click(copyButtonFor('Claude Code'));
    await vi.waitFor(() => expect(onCopy).toHaveBeenCalledTimes(1));
    fireEvent.click(copyButtonFor('Cursor'));
    await vi.waitFor(() => expect(onCopy).toHaveBeenCalledTimes(2));

    expect(onCopy.mock.calls).toEqual([
      [{ client: 'claude-code', kind: 'command' }],
      [{ client: 'cursor', kind: 'config' }],
    ]);
    vi.unstubAllGlobals();
  });

  it('does not report a copy that failed', async () => {
    const writeText = vi.fn().mockRejectedValue(new Error('denied'));
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const onCopy = vi.fn();
    const { copyButtonFor } = renderWithOnCopy(onCopy);

    fireEvent.click(copyButtonFor('Claude Code'));
    await vi.waitFor(() =>
      expect(errorSpy).toHaveBeenCalledWith('Failed to copy:', expect.any(Error))
    );

    expect(onCopy).not.toHaveBeenCalled();
    errorSpy.mockRestore();
    vi.unstubAllGlobals();
  });

  it('renders nothing when no server is configured via props or plugin', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { container } = render(<McpInstallButton />);
    expect(container.firstChild).toBeNull();
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });
});
