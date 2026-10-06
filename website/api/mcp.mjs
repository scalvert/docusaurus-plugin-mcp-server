// The MCP endpoint for this site, served at /mcp (see vercel.json).
// This is the file the Vercel deployment guide documents.
import { createWebRequestHandler } from 'docusaurus-plugin-mcp-server/adapters';
import bundle from '../build/mcp/bundle.json' with { type: 'json' };

export default {
  fetch: createWebRequestHandler({ artifacts: bundle }),
};
