/**
 * Request headers browser-based MCP clients send. Covers both protocol eras:
 * 2025-era `Mcp-Session-Id`/`Last-Event-ID`, and the 2026-07-28 routing
 * headers (`Mcp-Method`, `Mcp-Name`). `Mcp-Param-*` tool headers (SEP-2243)
 * are not used by this server's tools.
 */
const ALLOW_HEADERS = [
  'Content-Type',
  'Accept',
  'Authorization',
  'MCP-Protocol-Version',
  'Mcp-Method',
  'Mcp-Name',
  'Mcp-Session-Id',
  'Last-Event-ID',
].join(', ');

/**
 * Response headers browser-based MCP clients need to read.
 */
const EXPOSE_HEADERS = ['MCP-Protocol-Version', 'Mcp-Session-Id'].join(', ');

/**
 * Standard CORS headers for MCP server responses
 *
 * These headers enable cross-origin requests from browser-based MCP clients.
 */
export const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': ALLOW_HEADERS,
  'Access-Control-Expose-Headers': EXPOSE_HEADERS,
} as const;

/**
 * Get CORS headers as a plain object (for JSON responses)
 */
export function getCorsHeaders(origin: string = '*'): Record<string, string> {
  return {
    ...CORS_HEADERS,
    'Access-Control-Allow-Origin': origin,
  };
}
