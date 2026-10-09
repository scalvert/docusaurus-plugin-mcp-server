import type { CallToolResult, McpServer } from '@modelcontextprotocol/server';
import type { McpServerToolsConfig, SearchResult } from '../../types/index.js';
import type { Resolve } from '../resolve.js';
import type { SearchOptions } from '../../providers/types.js';

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
 * with the given message.
 */
export async function runTool(
  deps: Pick<DocsToolDeps, 'isReady'>,
  logLabel: string,
  failure: string,
  body: () => Promise<string>
): Promise<CallToolResult> {
  if (!deps.isReady()) {
    return toolError('Server not initialized. Please try again.');
  }

  try {
    return toolText(await body());
  } catch (error) {
    console.error(logLabel, error);
    return toolError(failure);
  }
}
