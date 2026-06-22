import { describe, it, expect } from 'vitest';

// Guard against phantom exports in the README export snippets. The package's own
// specifiers are aliased to src in vitest.config.ts, so importing a snippet that
// names a symbol the entry point does not export throws at import time.
describe('README export snippets resolve against the real public API', () => {
  it('Main Exports snippet imports only real "." exports', async () => {
    await expect(import('../snippets/readme/snippet-17.js')).resolves.toBeDefined();
  });

  it('Adapter Exports snippet imports only real ./adapters + ./adapters/node exports', async () => {
    await expect(import('../snippets/readme/snippet-18.js')).resolves.toBeDefined();
  });
});
