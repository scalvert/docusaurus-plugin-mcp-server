// Calls the Vercel function (api/mcp.mjs) in-process against the built bundle:
// the status check, a tool call with no prior handshake, and a 2025-era
// initialize. Run after `npm run build`; exits non-zero on any failure.
import handler from '../api/mcp.mjs';

const origin = 'https://smoke.test';
let failures = 0;

function check(label, ok, detail) {
  console.log(`${ok ? '✓' : '✗'} ${label}${ok ? '' : `: ${detail}`}`);
  if (!ok) failures++;
}

function post(body, headers = {}) {
  return handler.fetch(
    new Request(`${origin}/mcp`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream',
        ...headers,
      },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, ...body }),
    })
  );
}

const status = await handler.fetch(new Request(`${origin}/mcp`));
const statusBody = await status.json();
check('GET returns the status', status.ok && statusBody.initialized, JSON.stringify(statusBody));
check('the bundle has documents', statusBody.docCount > 0, `docCount ${statusBody.docCount}`);

const search = await post({
  method: 'tools/call',
  params: { name: 'docs_search', arguments: { query: 'deploy to vercel' } },
});
const searchText = await search.text();
check(
  'docs_search finds the Vercel guide',
  search.ok && searchText.includes('/docs/deploy/vercel'),
  searchText.slice(0, 300)
);

const init = await post({
  method: 'initialize',
  params: {
    protocolVersion: '2025-06-18',
    capabilities: {},
    clientInfo: { name: 'smoke', version: '0' },
  },
});
const initText = await init.text();
check(
  '2025-era initialize succeeds',
  init.ok && initText.includes('"serverInfo"'),
  initText.slice(0, 300)
);

if (failures > 0) {
  console.error(`\n${failures} check(s) failed`);
  process.exit(1);
}
console.log('\nMCP endpoint OK');
