/**
 * `./adapters` must bundle for edge runtimes (Cloudflare Workers, Vercel Edge,
 * Deno), which have no Node built-ins except, at most, `node:`-prefixed ones
 * under a compat flag. Bundle the entry the way those tools do and fail on
 * any unprefixed or static Node built-in.
 */

import { describe, it, expect } from 'vitest';
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import tsupConfig from '../tsup.config.js';

const entry = fileURLToPath(new URL('../src/adapters-entry.ts', import.meta.url));

describe('./adapters edge bundle', () => {
  it('bundles for a platform without Node built-ins', async () => {
    const result = await build({
      entryPoints: [entry],
      bundle: true,
      write: false,
      format: 'esm',
      platform: 'neutral',
      mainFields: ['module', 'main'],
      // What Wrangler resolves with. The MCP SDK picks its runtime shims by
      // condition; without one it falls back to its Node shim.
      conditions: ['workerd', 'worker', 'import', 'default'],
      // Edge runtimes may provide node:* under a compat flag; nothing else.
      external: ['node:*'],
      metafile: true,
      logLevel: 'silent',
    });

    // The only Node built-ins allowed are dynamic imports on paths the edge
    // never reaches: reading files (the deprecated file config), and turning a
    // `search` module path into a file URL (an edge runtime can't import
    // arbitrary paths anyway; it passes an instance).
    const imports = new Set(
      Object.values(result.metafile.outputs).flatMap((o) =>
        o.imports.filter((i) => i.external).map((i) => `${i.kind}:${i.path}`)
      )
    );
    expect([...imports].sort()).toEqual([
      'dynamic-import:node:fs/promises',
      'dynamic-import:node:path',
      'dynamic-import:node:url',
    ]);
  });

  it('tsup keeps the node: prefix in the published bundle', () => {
    const configs = Array.isArray(tsupConfig) ? tsupConfig : [tsupConfig];
    for (const config of configs) {
      expect((config as { removeNodeProtocol?: boolean }).removeNodeProtocol).toBe(false);
    }
  });
});
