# Troubleshooting: Write an agent guide

## `[MCP] Invalid agent guides:` and the build fails {#invalid-guides}

**Cause:** A guide breaks one of the format's rules. The error lists each problem with its page, for example a guide with no `description`, a step with no `id`, a `symptoms` prop naming a symptom that doesn't exist, or a `Step` outside an `AgentGuide`.

**Fix:** Fix each listed problem on the page it names, then build again. A guide's `name` can't match another skill's (the build reports that as a skill name collision), so rename one.

**Check:** `npm run build` completes.

Source: https://docusaurus-plugin-mcp-server.vercel.app/docs/guides/agent-guides#mcp-invalid-agent-guides-and-the-build-fails

## `[MCP] Agent guide:` warnings in the build log {#guide-warnings}

**Cause:** The guide compiles, but something makes it weaker: a step without a `Check`, a guide without symptoms, guide markup outside the page's content element, or guides on a site with skills turned off (`skills: false`), where they aren't served.

**Fix:** Add what the warning names. For markup outside the content element, move it into the page's content, or adjust [`contentSelectors`](https://docusaurus-plugin-mcp-server.vercel.app/docs/reference/plugin-options).

**Check:** The build log has no `[MCP] Agent guide:` lines.

Source: https://docusaurus-plugin-mcp-server.vercel.app/docs/guides/agent-guides#mcp-agent-guide-warnings-in-the-build-log

## Markdown inside a component shows as plain text, like `**Fix:**` or a code fence {#markdown-as-text}

**Cause:** MDX parses a component's content as Markdown only when there's a blank line after the opening tag and before the closing tag.

**Fix:** Add the blank lines, and put each component tag on its own line.

**Check:** The rendered page shows the formatting, and so does the compiled `SKILL.md`.

Source: https://docusaurus-plugin-mcp-server.vercel.app/docs/guides/agent-guides#markdown-inside-a-component-shows-as-plain-text-like-fix-or-a-code-fence

## `Expected component Step to be defined` {#missing-component}

**Cause:** The page uses a guide component that MDX doesn't know. Either the `mdxComponents` plugin option is `false`, or the site has an ejected `MDXComponents` that replaces the plugin's.

**Fix:** Import the components in the page (`import { AgentGuide, Step, Check } from 'docusaurus-plugin-mcp-server/theme'`), or spread `mdxComponents` into your `MDXComponents` ([MDX components](https://docusaurus-plugin-mcp-server.vercel.app/docs/reference/plugin-options#mdx-components)).

**Check:** The page builds.

Source: https://docusaurus-plugin-mcp-server.vercel.app/docs/guides/agent-guides#expected-component-step-to-be-defined
