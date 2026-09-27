/**
 * Bridge between Node.js http request/response objects and web-standard
 * Request/Response, so Node servers can use the same handler as edge runtimes.
 * Edge-safe to bundle: `node:http` is a type-only import and the runtime code
 * uses only web globals (Request, Headers, ReadableStream).
 */

import type { IncomingMessage, ServerResponse } from 'node:http';

/**
 * Build a web-standard Request from a Node request. When the body was
 * already parsed it's re-serialized; otherwise the raw stream is forwarded.
 */
export function toWebRequest(req: IncomingMessage, parsedBody: unknown): Request {
  const host = req.headers.host ?? 'localhost';
  const url = new URL(req.url ?? '/', `http://${host}`);

  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) {
      for (const v of value) headers.append(key, v);
    } else {
      headers.set(key, value);
    }
  }

  const method = req.method ?? 'GET';
  const hasBody = method !== 'GET' && method !== 'HEAD';

  if (!hasBody) {
    return new Request(url, { method, headers });
  }

  if (parsedBody !== undefined) {
    headers.delete('content-length');
    return new Request(url, { method, headers, body: JSON.stringify(parsedBody) });
  }

  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      for await (const chunk of req) {
        controller.enqueue(typeof chunk === 'string' ? new TextEncoder().encode(chunk) : chunk);
      }
      controller.close();
    },
  });

  return new Request(url, {
    method,
    headers,
    body,
    // Required by Node's fetch implementation for streaming request bodies.
    duplex: 'half',
  } as RequestInit);
}

/**
 * Write a web-standard Response to a Node ServerResponse, preserving any
 * headers already set on `res` (e.g. CORS).
 */
export async function writeWebResponse(response: Response, res: ServerResponse): Promise<void> {
  response.headers.forEach((value, key) => {
    res.setHeader(key, value);
  });
  res.writeHead(response.status, response.statusText);

  if (!response.body) {
    res.end();
    return;
  }

  const reader = response.body.getReader();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      res.write(value);
    }
  } finally {
    res.end();
  }
}
