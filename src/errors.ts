/** Where 1.x -> 2.0 errors send people (and agents) for the fix. */
export const MIGRATION_GUIDE =
  'https://github.com/scalvert/docusaurus-plugin-mcp-server/blob/main/migrations/1.x-2.0.0.md';

/**
 * A deployment problem the site owner must fix, such as a `search-index.json`
 * left over from 1.x. The message is written for them, says how to fix it,
 * and holds no secrets, so the adapters return it to clients instead of a
 * generic "Internal server error". Other errors stay generic on the wire.
 */
export class ConfigurationError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'ConfigurationError';
  }
}

/** JSON-RPC error body for an unhandled failure inside an adapter. */
export function internalErrorBody(error: unknown): string {
  return JSON.stringify({
    jsonrpc: '2.0',
    id: null,
    error: {
      code: -32603,
      message: error instanceof ConfigurationError ? error.message : 'Internal server error',
    },
  });
}
