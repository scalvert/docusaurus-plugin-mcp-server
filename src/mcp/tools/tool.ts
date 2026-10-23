import type { CallToolResult, McpServer } from '@modelcontextprotocol/server';
import type { McpServerToolsConfig, SearchResult } from '../../types/index.js';
import type { Resolve } from '../resolve.js';
import type { SearchOptions } from '../../providers/types.js';
import {
  clientFrom,
  emitEvent,
  type McpDocsEvent,
  type McpEventHandler,
  type McpToolCallEventBase,
  type ToolCallContext,
} from '../events.js';

/**
 * What a docs tool needs from the server. Internal: not exported from the
 * package.
 */
export interface DocsToolDeps {
  /** Search through the configured provider. */
  search(query: string, options: SearchOptions): Promise<SearchResult[]>;
  /** What a URI passed to `docs_fetch` names: a document, a skill file, or nothing. */
  resolve: Resolve;
  /** Whether the provider is ready; a provider may report not ready after initialization. */
  isReady(): boolean;
  /** Whether the server serves skills, so `docs_fetch` says it reads `skill://` URIs. */
  servesSkills: boolean;
  /** The configured `onEvent` handler, told about every tool call. */
  onEvent?: McpEventHandler;
}

/** How {@link runTool} logs, answers, and reports one tool call. */
export interface ToolCall {
  /** Prefix for the logged error when the body throws. */
  logLabel: string;
  /** The error text the agent gets when the body throws. */
  failure: string;
  /** The tool handler's context, for the calling client. */
  ctx?: ToolCallContext;
  /**
   * The event for this call, built after the body ran from the shared fields
   * plus what the tool recorded.
   */
  describe(base: McpToolCallEventBase): McpDocsEvent;
}

/**
 * A docs tool: registers its own description (or the configured override),
 * input schema, annotations, and handler on a server.
 */
export interface DocsToolModule {
  readonly name: 'docs_search' | 'docs_fetch';
  register(server: McpServer, deps: DocsToolDeps, overrides?: McpServerToolsConfig): void;
}

/** Annotations shared by every docs tool: they read the docs and nothing else. */
export const READ_ONLY_ANNOTATIONS = { readOnlyHint: true, openWorldHint: false } as const;

/** A successful single-text-block tool result */
export function toolText(text: string): CallToolResult {
  return { content: [{ type: 'text' as const, text }] };
}

/** A tool-level error result (the call reached the tool but failed) */
export function toolError(text: string): CallToolResult {
  return { ...toolText(text), isError: true };
}

/**
 * Run a tool body: answer with an error result if the provider is not ready,
 * return the body's text, and turn a thrown error into a logged error result
 * with the call's failure message. Then report the call to `onEvent`.
 */
export async function runTool(
  deps: Pick<DocsToolDeps, 'isReady' | 'onEvent'>,
  call: ToolCall,
  body: () => Promise<string>
): Promise<CallToolResult> {
  const started = performance.now();
  const result = await answer(deps, call, body);
  if (deps.onEvent) {
    const client = clientFrom(call.ctx);
    emitEvent(
      deps.onEvent,
      call.describe({
        type: 'tool_call',
        ok: !result.isError,
        durationMs: performance.now() - started,
        ...(client && { client }),
      })
    );
  }
  return result;
}

async function answer(
  deps: Pick<DocsToolDeps, 'isReady'>,
  call: ToolCall,
  body: () => Promise<string>
): Promise<CallToolResult> {
  if (!deps.isReady()) {
    return toolError('Server not initialized. Please try again.');
  }

  try {
    return toolText(await body());
  } catch (error) {
    console.error(call.logLabel, error);
    return toolError(call.failure);
  }
}
