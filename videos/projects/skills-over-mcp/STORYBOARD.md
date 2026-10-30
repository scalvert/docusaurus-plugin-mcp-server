# Ship Agent Skills with your docs

**Build:** `npx oncue render skills-over-mcp`
**Attaches to:** [Agent Skills](https://docusaurus-plugin-mcp-server.vercel.app/docs/guides/agent-skills)
**Covers:** docusaurus-plugin-mcp-server 2.6.0, on Docusaurus 3.10.2 and Node 22.20.0

| Scene | Visual | Real or illustrative |
|---|---|---|
| intro | 0 to 2.4 s, no narration: the plugin's logo dino spins the MCP card twice, then shrinks into the logo spot in the corner (`composition/Intro.tsx`) | Illustrative. An animation of the project's logo (`public/brand/dino-mcp-yellow.svg`), not product UI |
| s1 | Title card with two chips | Stylized |
| s2 | Terminal: the built-in `docs-research` skill, read from the bundle | **Real** (`capture/builtin.txt`). The command's own `cut -c 1-80` truncates the lines, shown on screen |
| s3 | Terminal: the author skill's file and frontmatter, then the config line | **Real** (`capture/tree.txt`, `capture/skill-head.txt`, `capture/config.txt`). The long `description:` line is wrapped at 100 columns, as a terminal would wrap it |
| s4 | Terminal: the build's `[MCP]` lines | **Real** (`capture/build.txt`) |
| s5 | Sequence diagram: agent and the docs MCP server | **Diagram** (labeled on screen). Its labels come from the real `initialize` response (`capture/initialize.json`) |
| s6 | Terminal: a Claude Code session | **Real** (`capture/session.json`). See Captures for what's condensed |
| s7 | End card | Stylized |

## Claims

- "Tool descriptions tell an agent what your docs tools do, not how to use your docs well": Agent
  Skills guide, first paragraph.
- "Every build includes one skill, docs research. It's written from your site": Agent Skills guide,
  "The built-in `docs-research` skill". On screen, its description names the Example Docs and
  example.com, and its "Where things are" section lists this site's sections (`capture/builtin.txt`).
- "It tells the agent to search, fetch the page, and link its source": the built-in skill's five
  workflow steps (`capture/builtin.txt`).
- "Put each skill in a folder with a skill dot M D, and point the plugin at the parent folder":
  Agent Skills guide, "Add your own skills" (`skills: { dir: 'mcp-skills' }`).
- "The plugin checks every skill, and packs it into the same bundle as your docs": Agent Skills
  guide ("validates every skill", "adds the skills to the artifact bundle, so the handler serves
  them with no extra config"); `capture/build.txt` ("Packaged 3 skill(s)"). The three are the
  built-in skill, `example-api-errors`, and the agent guide from the next video.
- "There's nothing extra to deploy": same guide, "with no extra config".
- "The server supports the M C P skills extension": `initialize` declares
  `io.modelcontextprotocol/skills` (`capture/initialize.json`); `src/mcp/skills.ts` handles
  `skills/list` and `skills/get`.
- "Few hosts do yet, so its instructions also list every skill, and tell the agent to read it with
  docs fetch": Agent Skills guide, "How clients get skills" ("Few hosts support the skills extension
  yet"); the real `instructions` text lists all three `skill://` URIs and says "call docs_fetch with
  its skill:// URI" (`capture/initialize.json`).
- The agent "reads the error skill first, searches, fetches the rate limiting section, and answers
  with the fix and a link": the session's three tool calls and answer (`capture/session.json`). The
  answer's numbers match the page: 100 and 1000 requests per minute, `X-RateLimit-Reset` (API
  Endpoints, "Rate Limiting").

## Captures

All captured 2026-10-30 on macOS, from the plugin's `examples/basic-docs` site at tag v2.6.0, copied
to `/tmp/example-docs` with these changes:

- The plugin comes from npm (`docusaurus-plugin-mcp-server@2.6.0`) instead of `file:../..`.
- Docusaurus is 3.10.2, the version the first video used. With the example's own lockfile
  (Docusaurus 3.9.2), the build fails with ``Can't resolve '@theme/MDXComponents/Ul'``. Not isolated;
  report upstream.
- A one-line `src/pages/index.md` homepage, as in the first video.
- An author skill, `mcp-skills/example-api-errors/SKILL.md`, written for this video. It maps the
  example's documented error codes to its pages. It's fictional "Example API" content, like the
  rest of the example site.
- `skills: { dir: 'mcp-skills' }` in the plugin options.
- The Installation page marked up as an agent guide (the next video).

The build ran with `npm run build`; `npx docusaurus-mcp-verify` passed ("3 skill(s)",
`capture/raw/verify.txt`). The local server is the example's `mcp-server.mjs` on
port 3456. `capture/initialize.json` is the `capabilities` and `instructions` of a real
`initialize` call to it (`capture/raw/probe.json`).

**Agent session.** Claude Code 2.1.312 (`claude-sonnet-5-5`), in an empty folder with only the
example server loaded, run the same way as the first video:

```text
claude -p "<prompt>" --mcp-config .mcp.json --strict-mcp-config \
  --allowedTools mcp__example-docs__docs_search mcp__example-docs__docs_fetch \
  --output-format stream-json --verbose
```

On screen: the prompt up to "What should I do?", on two lines as a shell shows a quoted string that
spans lines (the real prompt is one line, and also asks for three short sentences and a cited
URL); the three tool calls from the `stream-json` events, one line each; and the answer verbatim.
The full prompt is in `capture/session.json`; the raw session is in `capture/raw/` (git-ignored).

## Before release

- Narration was recorded 2026-10-30 with Steve's ElevenLabs voice (`JlIjsZ6UuvvPTqUbVOGz`,
  `eleven_v3`). A person listens to it, especially "M C P", "skill dot M D", "docs research",
  "docs fetch" and "four twenty nine".
- A person reviews the render: `npx oncue review skills-over-mcp`.
- Decide where this repo lives and where the video is hosted.
