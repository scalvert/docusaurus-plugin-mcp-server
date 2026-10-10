---
status: accepted
---

# Agent guides are skills compiled from page markup

Setup and troubleshooting procedures for agents are written inside the docs page, marked with `data-mcp-*` attributes (rendered by our components or the site's own), and compiled at build time into Agent Skills that the server serves like any other skill. We chose this so the agent's copy of a procedure can't drift from the page people read, so the result works in every host that already reads skills, and so guides add no new bundle member and no new MCP tool. The format is defined in [`docs/agent-guide-format.md`](../agent-guide-format.md).

## Considered Options

- **Hand-written skills in the plugin's skills `dir`.** Works today with no code. But the procedure then lives in two places, and the copy for agents goes stale without anyone noticing. Still the right choice for guidance that isn't tied to one page.
- **A remark plugin that reads guides from the MDX source.** It would see the source, not what the page renders: content pulled in from partials and components would be missed. It would also need to be wired into each site's MDX pipeline, while the rest of extraction already reads the built HTML.
- **Separate agent-only pages at unlisted URLs.** Users couldn't see what their agent was told, and serving one thing to agents and another to people looks like cloaking. Agent-only content stays in the page and in public `.md` files instead.
- **Dedicated MCP tools (`docs_setup`, `docs_troubleshoot`).** They'd duplicate the skills extension and cost every client tokens in `tools/list`. Skills, plus `docs_fetch` reading `skill://` URIs, already cover finding and reading a guide.
- **Mintlify-compatible `<Visibility for="agents">` naming.** Would let pages move over from Mintlify sites unchanged. We use `ForAgents`/`ForHumans` instead, which read better next to the other components. Renaming is mechanical if portability matters later.

## Consequences

- Guides are skills, so they go into the existing `skills` member of the artifact bundle. The bundle format version doesn't change.
- Extraction produces the agent view of every page: `ForAgents` content in, `ForHumans` content out (shipped in #173). `docs_fetch` returns text people don't see on the page.
- A guide outside the content element (`contentSelectors`) isn't extracted. The build warns when it finds `data-mcp-*` attributes there.
- Agent-only content is in the page HTML, hidden. Search engines see hidden text, which we accept because the same text is published openly in the compiled guide.
- The compiled skill's layout and the fixed "How to use this guide" text are versioned with the format (`metadata.agent-guide-format`), separately from the bundle and the package.
