/**
 * Server events: what the `onEvent` option reports. Edge-safe.
 *
 * An event carries what happened, not the wire format, so a site can send
 * the facts it wants to any analytics or logging backend. Tool inputs are
 * passed as received: `query` and `uri` come from the agent, so redact them
 * before they leave the server if your backend should not store free text.
 */

/** A client's name and version, as it reported them. */
export interface McpClientInfo {
  name: string;
  version?: string;
}

/** Fields every tool call event has. */
export interface McpToolCallEventBase {
  type: 'tool_call';
  /**
   * Whether the tool answered with a result rather than an error. A page that
   * does not exist is still a result: see `resolved` on `docs_fetch` events.
   */
  ok: boolean;
  /** Time the tool took, in milliseconds. */
  durationMs: number;
  /**
   * The calling client, when the request says. Protocol 2026-07-28 requests
   * carry it on every call. 2025-era clients send it only in `initialize`,
   * and the server is stateless, so their tool calls have no `client`.
   */
  client?: McpClientInfo;
}

/** A `docs_search` call. */
export interface McpDocsSearchEvent extends McpToolCallEventBase {
  tool: 'docs_search';
  /** The query as the agent sent it. */
  query: string;
  /** The result limit the call used. */
  limit: number;
  /** How many results the search returned. Absent when `ok` is false. */
  resultCount?: number;
}

/** A `docs_fetch` call. */
export interface McpDocsFetchEvent extends McpToolCallEventBase {
  tool: 'docs_fetch';
  /** The URL, path, or `skill://` URI as the agent sent it. */
  uri: string;
  /**
   * What the URI named: a document, a skill file, or nothing. Absent when
   * `ok` is false.
   */
  resolved?: 'document' | 'skill-file' | 'not-found';
  /**
   * The document ID when `resolved` is `document`: the page's absolute URL
   * (e.g. `https://docs.example.com/docs/install`), without a fragment,
   * whatever form the agent passed.
   */
  documentId?: string;
}

/** An event the server reports through `onEvent`. */
export type McpDocsEvent = McpDocsSearchEvent | McpDocsFetchEvent;

/**
 * Receives server events. The server does not wait for it, and a throw or a
 * rejected promise is logged, never returned to the client. On serverless
 * runtimes that stop work when the response is sent, keep async work alive
 * with the platform's `waitUntil`.
 */
export type McpEventHandler = (event: McpDocsEvent) => void | Promise<void>;

/** Report an event without letting the handler affect the response. */
export function emitEvent(onEvent: McpEventHandler | undefined, event: McpDocsEvent): void {
  if (!onEvent) return;
  try {
    const result = onEvent(event);
    if (result && typeof result.then === 'function') {
      result.then(undefined, (error: unknown) => console.error('[MCP] onEvent error:', error));
    }
  } catch (error) {
    console.error('[MCP] onEvent error:', error);
  }
}

/** The `_meta` key protocol 2026-07-28 requests carry the client's identity in. */
const CLIENT_INFO_META_KEY = 'io.modelcontextprotocol/clientInfo';

/** What a tool handler's context needs to have for {@link clientFrom}. */
export interface ToolCallContext {
  mcpReq?: { envelope?: object };
}

/**
 * The calling client from a tool handler's context: the per-request
 * envelope's client info, which the SDK has already validated. Undefined
 * for 2025-era requests, which carry no envelope.
 */
export function clientFrom(ctx: ToolCallContext | undefined): McpClientInfo | undefined {
  const envelope = ctx?.mcpReq?.envelope as Record<string, unknown> | undefined;
  const info = envelope?.[CLIENT_INFO_META_KEY];
  if (typeof info !== 'object' || info === null) return undefined;
  const { name, version } = info as { name?: unknown; version?: unknown };
  if (typeof name !== 'string') return undefined;
  return typeof version === 'string' ? { name, version } : { name };
}
