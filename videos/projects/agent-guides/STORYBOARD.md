# Turn a docs page into an agent guide

**Build:** `npx oncue render agent-guides`
**Attaches to:** [Agent guides](https://docusaurus-plugin-mcp-server.vercel.app/docs/guides/agent-guides)
**Covers:** docusaurus-plugin-mcp-server 2.6.0, on Docusaurus 3.10.2 and Node 22.20.0

| Scene | Visual | Real or illustrative |
|---|---|---|
| intro | 0 to 2.4 s, no narration: the plugin's logo dino spins the MCP card twice, then shrinks into the logo spot in the corner (`composition/Intro.tsx`) | Illustrative. An animation of the project's logo (`public/brand/dino-mcp-yellow.svg`), not product UI |
| s1 | Title card with two chips | Stylized |
| s2 | Browser: the Installation page, zoomed, step heading and check highlighted | **Real** 2x capture (`capture/page-install.png`) of the built site served locally |
| s3 | Terminal: the guide's component tags, grepped from the page source | **Real** (`capture/markup.txt`) |
| s4 | Browser: the same page, the `ForHumans` paragraph highlighted | **Real** 2x capture (`capture/page-env.png`). The `ForAgents` paragraph isn't on it because it's hidden |
| s5 | Terminal: the page's agent view from `docs_fetch`, then the hidden block in the built HTML | **Real** (`capture/agent-view.md`, `capture/hidden.txt`). See Captures |
| s6 | Terminal: the build's skill count, then the compiled guide's steps and checks | **Real** (`capture/build.txt`, `capture/compiled-outline.txt`) |
| s7 | Terminal: a Claude Code session | **Real** (`capture/session.json`). See Captures for what's condensed |
| s8 | End card | Stylized |

## Claims

- "Mark it up, and the build turns it into a skill an agent can follow, one step at a time":
  Agent guides guide, first paragraph.
- "People read it as they always have": same paragraph ("People reading the page see the same
  steps they always did"); `capture/page-install.png`.
- "Wrap the procedure in Agent Guide. Put each step in a Step component, with a Check that says
  how to tell it worked. Then add a Symptom for each error people hit": Agent guides guide, steps
  1 to 3.
- "For Humans shows on the page" and "For Agents is hidden from people, and goes only to agents":
  Writing for agents guide. Shown for real: the `ForHumans` paragraph is on the page
  (`capture/page-env.png`) and not in the agent view; the `ForAgents` paragraph is in the agent
  view (`capture/agent-view.md`, line 45) and not on the page.
- "It's hidden, not secret: anyone can read it in the page's source": Writing for agents, "Agent
  content is public"; `capture/hidden.txt` (`data-mcp-audience="agents" hidden=""` in the built
  HTML).
- "The guide compiles into a skill named after it": Agent guides guide, step 4;
  `capture/build.txt` ("including 1 agent guide(s)"); the skill is `setup-example-sdk`, the guide's
  `name`.
- "Steps come in order, each with its check, and the key step says Needs the user":
  `capture/compiled-outline.txt` (from `needs="user"`; Agent guides guide, step 2).
- The agent "reads the guide, searches, opens its troubleshooting, and answers with the fix and
  how to check it": the session's three tool calls and answer (`capture/session.json`). The answer
  matches the page's `Symptom` (Cause, Fix and Check).

## Captures

All captured 2026-10-30 on macOS, on the same `/tmp/example-docs` site as the skills video (see
its STORYBOARD.md for the changes to the plugin's example). For this video, the example's
Installation page is marked up as an agent guide, `setup-example-sdk`, and saved as
`capture/installation.md`. Its text is the example's own, apart from these additions:

- `DoneWhen`, `Prerequisites`, a `Check` for each step, and `needs="user"` on the API key step.
- One `ForHumans` paragraph (where the dashboard's button is) and one `ForAgents` paragraph (don't
  ask for the key in chat; suggest a test key).
- A `Troubleshooting` section with one `Symptom`, `ERR_MODULE_NOT_FOUND`.
- The verify snippet reads the key from `EXAMPLE_API_KEY`, as the page's next section recommends.
- The "Or using yarn" alternative is dropped, so step 1 has one action.

The build logged no `[MCP] Agent guide:` warnings. The full compiled `SKILL.md` is
`capture/compiled-SKILL.md`.

**Page captures.** `oncue capture pages capture/pages.json`, against the built site served by
`npx docusaurus serve --port 3000`. 1440×900 viewport at 2x; nothing hidden or edited. The URL bar
shows the local address.

**Agent view (s5).** The `docs_fetch` output is from a direct JSON-RPC `tools/call` to the local
server (`capture/raw/probe.json`), not from an agent. On screen it's labeled "docs_fetch · agent
view" and shows lines 37 to 45 of the result, verbatim; the long `ForAgents` line is wrapped at 100
columns, as a terminal would.

**Agent session.** Claude Code 2.1.312 (`claude-sonnet-5-5`), run the same way as the skills video.
On screen: the prompt up to "How do I fix it?", on two lines; the three tool calls, one line each;
and the answer verbatim.

Two runs: this one (take 1) read `skill://setup-example-sdk/SKILL.md` and its troubleshooting
reference. A second run, with a shorter prompt, read the built-in `docs-research` skill instead and
fetched the Installation page; it gave the same fix. Agents choose skills from their descriptions,
so both are normal. The video shows take 1 because it shows the guide being used. Take 2 is in
`capture/raw/take2/`.

## Before release

- Narration was recorded 2026-10-30 with Steve's ElevenLabs voice (`JlIjsZ6UuvvPTqUbVOGz`,
  `eleven_v3`). A person listens to it, especially "Agent Guide", "For Humans", "For Agents" and
  "Needs the user".
- A person reviews the render: `npx oncue review agent-guides`.
- Decide whether showing take 1 of two is fine, given the note above.
- Decide where this repo lives and where the video is hosted.
