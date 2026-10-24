# Troubleshooting: Write an agent guide

## `[MCP] Invalid agent guides:` and the build fails {#invalid-guides}

**Cause:** A guide breaks one of the format's rules. The error lists each problem with its page, for example a guide with no `description`, a step with no `id`, a `symptoms` prop naming a symptom that doesn't exist, a `Step` outside an `AgentGuide`, two guides with the same name, `Prerequisites` in a troubleshooting guide, or a symptom inside a guide that names another guide.

**Fix:** Fix each listed problem on the page it names, then build again.

**Check:** `npm run build` completes.

Source: https://docusaurus-plugin-mcp-server.vercel.app/docs/guides/agent-guides#mcp-invalid-agent-guides-and-the-build-fails

## `[MCP] Invalid skill at agent guide` with `is already used by`, and the build fails {#name-collision}

**Cause:** The guide's `name` matches another skill: a skill in the plugin's skills `dir`, or the built-in `docs-research`. Every skill needs its own name. Two guides with the same name fail with `[MCP] Invalid agent guides:` instead.

**Fix:** Rename the guide, or the other skill, then build again.

**Check:** `npm run build` completes.

Source: https://docusaurus-plugin-mcp-server.vercel.app/docs/guides/agent-guides#mcp-invalid-skill-at-agent-guide-with-is-already-used-by-and-the-build-fails

## `[MCP] Agent guide:` warnings in the build log {#guide-warnings}

**Cause:** The guide compiles, but something makes it weaker: a step without a `Check`, a step without a title or heading, a guide without symptoms, or guide markup (including `ForAgents` and `ForHumans`) outside the page's content element.

**Fix:** Add what the warning names. For markup outside the content element, move it into the page's content, or adjust [`contentSelectors`](https://docusaurus-plugin-mcp-server.vercel.app/docs/reference/plugin-options).

**Check:** The build log has no `[MCP] Agent guide:` lines.

Source: https://docusaurus-plugin-mcp-server.vercel.app/docs/guides/agent-guides#mcp-agent-guide-warnings-in-the-build-log

## `[MCP] Found N agent guide(s), but skills are disabled` {#skills-off}

**Cause:** The site sets `skills: false`, so the build compiles no skills, and its guides aren't served. `docusaurus-mcp-verify` doesn't repeat this warning.

**Fix:** Remove `skills: false` from the plugin options, or set `skills` to an object such as `{ builtin: false }` to turn off only the built-in skill. Then build again.

**Check:** The build log has `[MCP] Packaged N skill(s), including M agent guide(s)`.

Source: https://docusaurus-plugin-mcp-server.vercel.app/docs/guides/agent-guides#mcp-found-n-agent-guides-but-skills-are-disabled

## Markdown inside a component shows as plain text, like `**Fix:**` or a code fence {#markdown-as-text}

**Cause:** MDX parses a component's content as Markdown only when there's a blank line after the opening tag and before the closing tag.

**Fix:** Add the blank lines, and put each component tag on its own line.

**Check:** The rendered page shows the formatting, and so does the compiled `SKILL.md`.

Source: https://docusaurus-plugin-mcp-server.vercel.app/docs/guides/agent-guides#markdown-inside-a-component-shows-as-plain-text-like-fix-or-a-code-fence

## ``Expected component `Step` to be defined`` {#missing-component}

**Cause:** The page uses a guide component that MDX doesn't know. The `mdxComponents` plugin option is `false`, the site has an ejected `MDXComponents` that replaces the plugin's, or the site lists `@docusaurus/theme-classic` under `themes`, which loads after the plugin and replaces its components.

**Fix:** Import the components in the page (`import { AgentGuide, Step, Check } from 'docusaurus-plugin-mcp-server/theme'`), spread `mdxComponents` into your `MDXComponents`, or list the plugin under `themes` after the classic theme ([MDX components](https://docusaurus-plugin-mcp-server.vercel.app/docs/reference/plugin-options#mdx-components)).

**Check:** The page builds.

Source: https://docusaurus-plugin-mcp-server.vercel.app/docs/guides/agent-guides#expected-component-step-to-be-defined
