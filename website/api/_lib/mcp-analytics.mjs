// Usage events from the MCP endpoint (api/mcp.mjs), as Vercel Web Analytics
// custom events. Each event has two properties, the Pro plan limit. Values
// come from the search index or a fixed set: the agent's query and the URI it
// fetched are never sent.
//
// Vercel doesn't serve files under api/_lib as functions.

/** Vercel rejects names, keys, and values longer than this. */
const MAX_LENGTH = 255;

/**
 * The analytics event for one tool call:
 *
 * - `mcp_search`: `top` is the path of the search's first result, `none`, or
 *   `error`. It shows what agents look for without the query.
 * - `mcp_fetch`: `page` is the path of the page read, `skill`, `not-found`,
 *   or `error`.
 *
 * Both have `client`, the client's reported name as an ID, or `unknown`.
 */
export function analyticsEventFor(event) {
  const client = clientId(event.client?.name);
  if (event.tool === 'docs_search') {
    return { name: 'mcp_search', properties: { top: topResult(event), client } };
  }
  return { name: 'mcp_fetch', properties: { page: fetchedPage(event), client } };
}

/** The path of a search's first result, `none`, or `error`. */
export function topResult(event) {
  if (!event.ok) return 'error';
  const first = event.results?.[0];
  return first ? pagePath(first.url) : 'none';
}

/**
 * The path of the page a fetch read, `skill`, `not-found`, or `error`. The
 * page is named by the ID the server resolved, never by the URI the agent
 * sent.
 */
export function fetchedPage(event) {
  if (!event.ok) return 'error';
  if (event.resolved === 'skill-file') return 'skill';
  if (event.resolved !== 'document' || !event.documentId) return 'not-found';
  return pagePath(event.documentId);
}

/**
 * The client's reported name as an ID, such as `claude-code`, or `unknown`.
 * Only protocol 2026-07-28 requests name their client, so 2025-era calls are
 * `unknown`.
 */
export function clientId(name) {
  const id = (name ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 64);
  return id || 'unknown';
}

/** A page's path, without its query string or fragment. */
function pagePath(url) {
  try {
    return new URL(url, 'https://localhost').pathname.slice(0, MAX_LENGTH);
  } catch {
    return 'unknown';
  }
}
