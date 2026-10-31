# Your Docusaurus docs, as an MCP server

**Build:** `npx oncue render docs-mcp-server`
**Attaches to:** [Getting started](https://docusaurus-plugin-mcp-server.vercel.app/docs/getting-started)
**Covers:** docusaurus-plugin-mcp-server 2.6.0, on Docusaurus 3.10.2 and Node 22.20.0

| Scene | Visual | Real or illustrative |
|---|---|---|
| intro | 0 to 2.4 s, no narration: the plugin's logo dino spins the MCP card twice, then shrinks into the logo spot in the corner (`composition/Intro.tsx`) | Illustrative. An animation of the project's logo (`public/brand/dino-mcp-yellow.svg`), not product UI |
| s1 | Title card with the two tool names | Stylized. Tool names from `tools/list` (`capture/raw/tools-list.txt`) |
| s2 | Terminal: install, then the plugin entry in the config | **Real** (`capture/install.txt`, `capture/config.txt`) |
| s3 | Terminal: build (MCP lines), then `docusaurus-mcp-verify` | **Real** (`capture/build.txt`, `capture/verify.txt`). Verify output ends at "All checks passed!"; its "Next steps" lines are left off |
| s4 | Sequence diagram: agent, `/mcp` handler, bundle | **Diagram** (labeled on screen). The handler was run, see Claims |
| s5 | Terminal: `claude mcp add`, then an agent session | **Real** (`capture/mcp-add.txt`, `capture/session.json`). See Captures for what's condensed |
| s6 | End card | Stylized |

## Claims

- "This Docusaurus plugin gives it your real docs, as an MCP server": README, first paragraph.
- "Install it, and add it to the plugins in your Docusaurus config. Give the server a name": Getting
  started, steps 1 and 2; README Quick Start. Every option is optional (Getting started, step 2).
- "The plugin turns every page into a search index and one bundle": the build writes
  `build/mcp/bundle.json` and `search-index.json` (`capture/build.txt`; Getting started, step 3).
- "The verify command starts a server from that bundle, and checks it": Getting started, step 3;
  `capture/verify.txt` ("Server "example-docs" initialized with 7 documents").
- "Export one web request handler": README, step 2 (`createWebRequestHandler`). Run for real: the
  README snippet, saved as `api/mcp.mjs`, answered a `docs_search` call with HTTP 200
  (`capture/raw/handler.txt`, `capture/raw/try-handler.mjs`).
- "Run on Vercel, Netlify, Cloudflare Workers, Deno, Bun, or Node": README platform table, with a
  guide for each. Only Node was run here.
- "It reads the skill the server ships, searches the docs, fetches the page, and answers with a link
  to the source": the session's three tool calls and answer (`capture/session.json`). The server
  ships one skill (`capture/verify.txt`, "1 skill(s)").

## Captures

All captured 2026-10-26 on macOS, from the plugin's `examples/basic-docs` site at tag v2.6.0, copied
to `/tmp/example-docs` (so no home paths appear) with two changes:

- The plugin comes from npm (`docusaurus-plugin-mcp-server@2.6.0`) instead of `file:../..`.
- A one-line `src/pages/index.md` homepage. Without it, the example's build fails on Docusaurus
  3.10.2 ("Docusaurus found broken links", every page links to `/`). The MCP artifacts were written
  either way. Report upstream.

Terminal captures were recorded with `oncue capture cli` in a real TTY.

The install (`capture/install.txt`) was re-captured on 2026-10-30 with the plain command from the
plugin's README, `npm install docusaurus-plugin-mcp-server`, in a fresh copy of the same example
(`/tmp/example-docs-fresh`). Before the install, that copy had the plugin removed from
`package.json` and its dependencies installed on Docusaurus 3.10.2. npm installed
`docusaurus-plugin-mcp-server@2.6.0`, which is still npm's latest.

The capture ran with `npm_config_audit=false` and `npm_config_fund=false` set on that one process
(`oncue capture cli --env`), so npm's audit and funding notices are not in the output. These are
the same settings as `audit=false` and `fund=false` in an `.npmrc`. Nothing was written to any
`.npmrc`, and `npm config get audit fund` still reports `true` for both. A viewer who runs the
command sees npm's normal notices as well. Those audit counts (25 in this example) belong to the
example's Docusaurus dependencies, not the plugin: the site reported the same 25 before the plugin
was installed, and `npm audit --json` lists no vulnerable package under
`docusaurus-plugin-mcp-server`. Earlier captures are kept in `capture/raw/`:
`install-with-no-audit-flags.txt` (flags on screen) and `install-with-audit.txt` (full notices).

The config excerpt (`capture/config.txt`) is the real output of
`grep -A 7 "plugins: [" docusaurus.config.js`.

**Agent session.** Claude Code 2.1.284 (`claude-sonnet-5-5`), in an empty folder with only the
example server loaded. On screen: the real `claude mcp add` output, the prompt's first sentence, the
three tool calls from the session's `stream-json` events (one line each), and the answer verbatim.
The session ran as:

```text
claude -p "<prompt>" --mcp-config .mcp.json --strict-mcp-config \
  --allowedTools mcp__example-docs__docs_search mcp__example-docs__docs_fetch \
  --output-format stream-json --verbose
```

The full prompt is in `capture/session.json`. The raw session and the other raw output are in
`capture/raw/` (git-ignored).

## Before release

- Narration was recorded 2026-10-30 with Steve's ElevenLabs voice (`JlIjsZ6UuvvPTqUbVOGz`,
  `eleven_v3`). A person still listens to it, especially "M C P", "Docusaurus", "Netlify" and
  "Deno".
- A person reviews the render: `npx oncue review docs-mcp-server`.
- Decide where this repo lives and where the video is hosted.
