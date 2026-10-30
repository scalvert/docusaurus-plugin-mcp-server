// The MCP endpoint for this site, served at /mcp (see vercel.json).
// This is the file the Vercel deployment guide documents, plus the usage
// events from the Track usage guide.
import { track } from '@vercel/analytics/server';
import { createWebRequestHandler } from 'docusaurus-plugin-mcp-server/adapters';
import bundle from '../build/mcp/bundle.json' with { type: 'json' };
import { analyticsEventFor } from './_lib/mcp-analytics.mjs';

// Each tool call becomes one Vercel Web Analytics event. On Vercel, `track`
// reads the request's headers from the request context and gives its send to
// the context's `waitUntil`, so the response doesn't wait for it. Off Vercel
// (the smoke test, the site contract tests) nothing is sent.
function sendEvent(event) {
  const { name, properties } = analyticsEventFor(event);
  return track(name, properties);
}

export default {
  fetch: createWebRequestHandler({
    artifacts: bundle,
    onEvent: process.env.VERCEL ? sendEvent : undefined,
  }),
};
