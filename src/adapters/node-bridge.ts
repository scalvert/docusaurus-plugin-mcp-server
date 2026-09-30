/**
 * Bridge between Node.js http request/response objects and web-standard
 * Request/Response, so Node servers can use the same handler as edge runtimes.
 * Edge-safe to bundle: `node:http` is a type-only import and the runtime code
 * uses only web globals (Request, Headers, ReadableStream).
 */

import type { IncomingMessage, ServerResponse } from 'node:http';

/**
 * Build a web-standard Request from a Node request. When the body was
 * already parsed it's re-serialized; otherwise the raw stream is forwarded,
 * unless `stream: false` (the caller has consumed it, or doesn't want it).
 */
export function toWebRequest(
  req: IncomingMessage,
  parsedBody: unknown,
  options: { stream?: boolean } = {}
): Request {
  const url = requestUrl(req);

  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers ?? {})) {
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

  if (options.stream === false) {
    headers.delete('content-length');
    return new Request(url, { method, headers });
  }

  // A rejected start() errors the stream, so socket errors mid-body reach
  // the body reader (covered in tests/node-bridge-test.ts).
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
 * The request URL. A malformed Host header or request target falls back to
 * localhost rather than failing the request; the handlers don't route on it.
 */
function requestUrl(req: IncomingMessage): URL {
  try {
    return new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
  } catch {
    return new URL('http://localhost/');
  }
}

/** `content-type` → `Content-Type`. Web Headers lowercase names; Node sends them as set. */
function canonicalHeaderName(name: string): string {
  return name.replace(/(^|-)([a-z])/g, (match) => match.toUpperCase());
}

/**
 * Write a web-standard Response to a Node ServerResponse, preserving any
 * headers already set on `res` (e.g. CORS). A JSON body is complete before
 * it is sent, so it is written in one `end()` (with a Content-Length); any
 * other body, such as an SSE stream, is streamed.
 */
export async function writeWebResponse(response: Response, res: ServerResponse): Promise<void> {
  response.headers.forEach((value, key) => {
    res.setHeader(canonicalHeaderName(key), value);
  });
  // An empty statusText would send an empty reason phrase; let Node fill it in.
  if (response.statusText) {
    res.writeHead(response.status, response.statusText);
  } else {
    res.writeHead(response.status);
  }

  if (!response.body) {
    res.end();
    return;
  }

  if (response.headers.get('content-type')?.includes('application/json')) {
    res.end(await response.text());
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
