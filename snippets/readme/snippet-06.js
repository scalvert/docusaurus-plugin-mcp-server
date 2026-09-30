import { createWebRequestHandler } from 'docusaurus-plugin-mcp-server/adapters';
import bundle from '../build/mcp/bundle.json';

export default {
  // Name, version, and site URL come from the build; pass them here to override.
  fetch: createWebRequestHandler({ artifacts: bundle }),
};
