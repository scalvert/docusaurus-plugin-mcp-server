/**
 * Standard CORS headers for MCP server responses
 *
 * These headers enable cross-origin requests from browser-based MCP clients.
 */
export const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
} as const;

/**
 * Get CORS headers as a plain object (for JSON responses)
 */
export function getCorsHeaders(): Record<string, string> {
  return { ...CORS_HEADERS };
}
