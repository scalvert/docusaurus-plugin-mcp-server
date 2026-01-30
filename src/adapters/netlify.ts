/**
 * Netlify adapter for MCP server
 *
 * Creates a Netlify serverless function handler for the MCP server.
 * Converts Netlify's AWS Lambda-style events to Web Standard Request
 * and uses the MCP SDK's transport for proper protocol handling.
 *
 * @example
 * // netlify/functions/mcp.js
 * import { createNetlifyHandler } from 'docusaurus-plugin-mcp-server/adapters';
 * import path from 'path';
 * import { fileURLToPath } from 'url';
 *
 * const __dirname = path.dirname(fileURLToPath(import.meta.url));
 *
 * export const handler = createNetlifyHandler({
 *   docsPath: path.join(__dirname, '../../build/mcp/docs.json'),
 *   indexPath: path.join(__dirname, '../../build/mcp/search-index.json'),
 *   name: 'my-docs',
 *   baseUrl: 'https://docs.example.com',
 * });
 */

import { McpDocsServer } from '../mcp/server.js';
import type { McpServerConfig } from '../types/index.js';
import { getCorsHeaders } from './cors.js';

/**
 * Netlify event object (simplified interface)
 */
export interface NetlifyEvent {
  httpMethod: string;
  headers: Record<string, string | undefined>;
  body: string | null;
  isBase64Encoded?: boolean;
  path?: string;
  rawUrl?: string;
}

/**
 * Netlify context object (simplified interface)
 */
export interface NetlifyContext {
  functionName: string;
  functionVersion?: string;
  invokedFunctionArn?: string;
  memoryLimitInMB?: string;
  awsRequestId?: string;
  logGroupName?: string;
  logStreamName?: string;
  getRemainingTimeInMillis?: () => number;
}

/**
 * Netlify function response
 */
interface NetlifyResponse {
  statusCode: number;
  headers?: Record<string, string>;
  body?: string;
}

/**
 * Convert a Netlify event to a Web Standard Request
 */
function eventToRequest(event: NetlifyEvent): Request {
  const url = event.rawUrl || `https://localhost${event.path || '/'}`;

  const headers = new Headers();
  for (const [key, value] of Object.entries(event.headers)) {
    if (value) {
      headers.set(key, value);
    }
  }

  // Decode body if base64 encoded
  let body: string | null = event.body;
  if (body && event.isBase64Encoded) {
    body = Buffer.from(body, 'base64').toString('utf-8');
  }

  return new Request(url, {
    method: event.httpMethod,
    headers,
    body: event.httpMethod !== 'GET' && event.httpMethod !== 'HEAD' ? body : undefined,
  });
}

/**
 * Convert a Web Standard Response to a Netlify response
 */
async function responseToNetlify(
  response: Response,
  additionalHeaders: Record<string, string>
): Promise<NetlifyResponse> {
  const headers: Record<string, string> = { ...additionalHeaders };
  response.headers.forEach((value, key) => {
    headers[key] = value;
  });

  const body = await response.text();

  return {
    statusCode: response.status,
    headers,
    body: body || undefined,
  };
}

/**
 * Create a Netlify serverless function handler for the MCP server
 *
 * Uses the MCP SDK's WebStandardStreamableHTTPServerTransport for
 * proper protocol handling.
 */
export function createNetlifyHandler(config: McpServerConfig) {
  let server: McpDocsServer | null = null;

  function getServer(): McpDocsServer {
    if (!server) {
      server = new McpDocsServer(config);
    }
    return server;
  }

  return async function handler(
    event: NetlifyEvent,
    _context: NetlifyContext
  ): Promise<NetlifyResponse> {
    const corsHeaders = getCorsHeaders();
    const headers = {
      'Content-Type': 'application/json',
      ...corsHeaders,
    };

    // Handle CORS preflight
    if (event.httpMethod === 'OPTIONS') {
      return {
        statusCode: 204,
        headers: corsHeaders,
      };
    }

    // Handle GET requests for health check
    if (event.httpMethod === 'GET') {
      const mcpServer = getServer();
      const status = await mcpServer.getStatus();
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify(status),
      };
    }

    // Only allow POST requests for MCP
    if (event.httpMethod !== 'POST') {
      return {
        statusCode: 405,
        headers,
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: null,
          error: {
            code: -32600,
            message: 'Method not allowed. Use POST for MCP requests, GET for status.',
          },
        }),
      };
    }

    try {
      const mcpServer = getServer();

      // Convert Netlify event to Web Standard Request
      const request = eventToRequest(event);

      // Use the SDK's Web Standard transport to handle the request
      const response = await mcpServer.handleWebRequest(request);

      // Convert back to Netlify response format with CORS headers
      return await responseToNetlify(response, corsHeaders);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('MCP Server Error:', error);
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: null,
          error: {
            code: -32603,
            message: `Internal server error: ${errorMessage}`,
          },
        }),
      };
    }
  };
}
