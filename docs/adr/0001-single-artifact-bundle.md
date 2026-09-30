---
status: accepted
---

# One artifact bundle file, with the core owning documents

The build writes the whole artifact bundle to a single `build/mcp/bundle.json` that edge runtimes import once, and the plugin core (not the `local` indexer) always writes the documents. We chose this so that site owners' deployment code never knows individual artifact filenames, the server's name and version come from the manifest instead of being repeated in runtime config, and `docs_fetch` works no matter which indexers ran.

Through 2.x the build also writes the per-file copies (`docs.json`, `search-index.json`, `skills.json`, `manifest.json`, indexer extras) so existing deployments keep working. That duplication is deliberate. It goes away in 3.0, when `bundle.json` becomes the only output.

## Considered Options

- **The Worker imports each file and assembles the bundle itself.** Works with every bundler, but user code still hardcodes four filenames, and that coupling is what this decision removes.
- **A generated `build/mcp/index.js` that re-exports the JSON.** Depends on `with { type: 'json' }` import attributes, which bundlers support unevenly (wrangler, Vercel, and Netlify esbuild versions differ).
- **Keep `docs.json` with the `local` indexer.** Less code moves, but a site that configures only custom indexers gets no documents and a broken `docs_fetch`.

## Consequences

- `bundle.json` carries a top-level `formatVersion`. Members keep their own versions (`skills`, `searchIndex`) so they can change independently.
- Indexers may not emit `docs.json`, `manifest.json`, `skills.json`, or `bundle.json`. Any other file an indexer emits becomes an indexer extra inside the bundle.
- Indexer extras make `bundle.json` larger for every edge deployment. We accept this because an edge search provider has to import that data anyway.
