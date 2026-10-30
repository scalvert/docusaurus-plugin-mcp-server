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
   * The calling client, when the request says. On protocol 2026-07-28, a
   * request names its client when the client includes its info, as the
   * TypeScript SDK client does on every call. 2025-era clients send it only
   * in `initialize`, and the server is stateless, so their tool calls have
   * no `client`.
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
  /**
   * The pages the search returned, in rank order: each page's absolute URL
   * and route, as the search provider reported them. Absent when `ok` is
   * false, and empty when the search found nothing. Use it to see what a
   * search surfaced without storing the query.
   *
   * @since 2.7
   */
  results?: Array<{ url: string; route: string }>;
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
   * The document ID when `resolved` is `document`, whatever form the agent
   * passed. For a bundle the plugin builds, it's the page's absolute URL
   * (e.g. `https://docs.example.com/docs/install`), without a fragment or
   * query string. A custom provider whose `getDocument` accepts the URL as
   * sent makes that URL the ID, without its fragment but with any query
   * string, so strip the query string before you store it.
   */
  documentId?: string;
}

/** An event the server reports through `onEvent`. */
export type McpDocsEvent = McpDocsSearchEvent | McpDocsFetchEvent;

/**
 * Receives server events. The server does not wait for it, and a throw or a
 * rejected promise is logged, never returned to the client. On serverless
 * runtimes that stop work when the response is sent, return the promise and
 * give the handler the request's `waitUntil`: the server passes the promise
 * to it.
 */
export type McpEventHandler = (event: McpDocsEvent) => void | Promise<void>;

/**
 * Keeps a promise running after the response is sent, like the
 * `waitUntil` that Cloudflare Workers, Netlify, and Vercel provide for each
 * request.
 *
 * @since 2.6
 */
export type WaitUntil = (promise: Promise<unknown>) => void;

/**
 * Report an event without letting the handler affect the response. A promise
 * the handler returns goes to `waitUntil`, after its rejection is logged.
 */
export function emitEvent(
  onEvent: McpEventHandler | undefined,
  event: McpDocsEvent,
  waitUntil?: WaitUntil
): void {
  if (!onEvent) return;
  let result: void | Promise<void>;
  try {
    result = onEvent(event);
  } catch (error) {
    console.error('[MCP] onEvent error:', error);
    return;
  }
  if (!result || typeof result.then !== 'function') return;

  const settled = result.then(undefined, (error: unknown) => {
    console.error('[MCP] onEvent error:', error);
  });
  if (!waitUntil) return;
  try {
    waitUntil(settled);
  } catch (error) {
    console.error('[MCP] waitUntil error:', error);
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
