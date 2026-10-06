---
title: Artifact bundle
description: What the build writes to build/mcp, and what each file is for.
---

# Artifact bundle

The **artifact bundle** is everything the server needs to run, produced by one build. The plugin writes it to `build/mcp/bundle.json` (or to the directory set by [`outputDir`](./plugin-options.md)).

## What's in it

| Member | Description |
| --- | --- |
| `formatVersion` | Layout version of the bundle. The runtime rejects bundles newer than it can read, with a message saying which version to upgrade to |
| `manifest` | The build that produced it: server name and version, site URL, build time, document and skill counts, and which indexers ran |
| `docs` | Every extracted page (title, description, Markdown, headings), keyed by its document ID, the page's full URL |
| `searchIndex` | The search index, if an indexer produced one. The built-in `local` indexer does by default |
| `skills` | The packaged [Agent Skills](../guides/agent-skills.md), if any |
| `extras` | Files contributed by [custom indexers](../guides/custom-providers.md#contentindexer), keyed by filename. Only a matching search provider reads them |

## Files in `build/mcp/`

| File | Purpose |
| --- | --- |
| `bundle.json` | The bundle. **This is the file to import in your function.** |
| `docs.json`, `search-index.json`, `skills.json`, `manifest.json` | The same members as separate files, kept through 2.x for deployments that read them individually. Deprecated, and removed in 3.0 |
| other files | Indexer extras, written by custom indexers |

## Using it

- **Serverless and edge:** import it as JSON and pass it as `artifacts`:

  ```javascript
  import bundle from '../build/mcp/bundle.json' with { type: 'json' };
  createWebRequestHandler({ artifacts: bundle });
  ```

- **Node:** pass the directory as `artifactsDir`, or read it yourself with `readArtifactBundle('./build/mcp')`.

The bundle is plain JSON and contains only your published pages, so it's safe to serve publicly. Its size grows with your docs, and most of it is the Markdown and the search index. Check it with `ls -lh build/mcp/bundle.json` if your platform limits function size.
