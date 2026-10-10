---
title: Agent guides
description: Mark up a setup or troubleshooting page so the build compiles it into an Agent Skill that agents can follow, step by step.
---

# Agent guides

An agent guide is a setup or troubleshooting procedure, written in the docs page people already read, that the build compiles into an [Agent Skill](./agent-skills.md). Agents get the steps, how to check each one worked, and what to do when a check fails. People reading the page see the same steps they always did, so the two can't drift apart.

## This site's guides

Every procedure on this site is a guide. Read a page, then the skill the build made from it:

| Page | Skill |
| --- | --- |
| [Getting started](../getting-started.md) | [`setup-docusaurus-mcp`](https://github.com/scalvert/docusaurus-plugin-mcp-server/blob/main/skills/guides/setup-docusaurus-mcp/SKILL.md) |
| [Deploy to Vercel](../deploy/vercel.md) | [`deploy-docusaurus-mcp-vercel`](https://github.com/scalvert/docusaurus-plugin-mcp-server/blob/main/skills/guides/deploy-docusaurus-mcp-vercel/SKILL.md) |
| [Deploy to Netlify](../deploy/netlify.md) | [`deploy-docusaurus-mcp-netlify`](https://github.com/scalvert/docusaurus-plugin-mcp-server/blob/main/skills/guides/deploy-docusaurus-mcp-netlify/SKILL.md) |
| [Deploy to Cloudflare Workers](../deploy/cloudflare-workers.md) | [`deploy-docusaurus-mcp-cloudflare`](https://github.com/scalvert/docusaurus-plugin-mcp-server/blob/main/skills/guides/deploy-docusaurus-mcp-cloudflare/SKILL.md) |
| [GitHub Pages and other static hosts](../deploy/static-hosts.md) | [`deploy-docusaurus-mcp-static-host`](https://github.com/scalvert/docusaurus-plugin-mcp-server/blob/main/skills/guides/deploy-docusaurus-mcp-static-host/SKILL.md) |
| This page | [`write-docusaurus-agent-guide`](https://github.com/scalvert/docusaurus-plugin-mcp-server/blob/main/skills/guides/write-docusaurus-agent-guide/SKILL.md) |

Their symptoms come from [Troubleshooting deployments](../deploy/troubleshooting.md), where each section names the guides it belongs to. This site's MCP endpoint serves the skills (`skill://setup-docusaurus-mcp/SKILL.md`), and the repository ships the same files, so `npx skills add scalvert/docusaurus-plugin-mcp-server` installs them.

<AgentGuide
  name="write-docusaurus-agent-guide"
  kind="setup"
  title="Write an agent guide"
  description="Turn a setup or troubleshooting procedure in a Docusaurus page into an agent guide with docusaurus-plugin-mcp-server's AgentGuide, Step, Check, and Symptom components, then build and read the compiled skill. Use when the user wants to write, add, or fix an agent guide, or make a docs procedure something AI agents can follow.">

<DoneWhen>

`npm run build` logs `[MCP] Packaged N skill(s), including M agent guide(s)` with no `[MCP] Agent guide:` warnings, and the compiled `SKILL.md` lists every step in order, each with its check.

</DoneWhen>

<Prerequisites>

- The site builds with the plugin: `npm run build` writes `build/mcp/bundle.json`. If not, follow [Getting started](../getting-started.md) first.
- A procedure for one task, with an end someone can see: a command's output, a page that loads, a setting that shows as on.

</Prerequisites>

<Step id="wrap" symptoms="invalid-guides">

## 1. Wrap the procedure

Wrap the procedure in `AgentGuide` and say how to tell it worked with `DoneWhen`. The components need no import; the plugin adds them to your theme's MDX components:

````mdx
<AgentGuide
  name="setup-widget"
  kind="setup"
  description="Install the widget CLI. Use when the user wants to install or set up the widget.">

<DoneWhen>

`widget --version` prints a version number.

</DoneWhen>

<Prerequisites>

- Node.js 22 or later. Check: `node --version`.

</Prerequisites>

...the steps...

</AgentGuide>
````

- **`name`** becomes the skill's name: lowercase letters, digits, and single hyphens. Make it specific enough to stand out among the other skills an agent has installed.
- **`kind`** is `setup` for a procedure with steps, or `troubleshooting` for symptoms only, for problems that aren't tied to one setup.
- **`description`** is what an agent reads to decide whether to use the guide. Say what it does, then "Use when…".
- **`DoneWhen`** says how to tell the whole guide worked. Every guide has exactly one.
- **`Prerequisites`** is optional: what has to be true before step 1, each with how to check it.

Leave a blank line after each opening tag and before each closing tag, so the Markdown inside is parsed as Markdown.

<Check>

The page has one `AgentGuide` with a `name`, `kind`, and `description`, and one `DoneWhen` inside it.

</Check>

</Step>

<Step id="steps" symptoms="markdown-as-text missing-component">

## 2. Mark up each step

Wrap each step in `Step`, with a `Check` that says how to tell it worked:

````mdx
<Step id="install" symptoms="not-found">

## 1. Install the CLI

```bash
npm install -g widget
```

<Check>

`widget --version` prints a version number.

</Check>

</Step>
````

- **`id`** is stable: agents and symptoms refer to the step by it. Don't renumber it when steps move.
- **A step's title** is its `title` prop, or the first heading inside it. Wrapping existing headings, as above, keeps them in the page's table of contents. A leading `1.` is dropped, since the compiled guide numbers steps itself.
- **`Check`** says how to tell a step worked. Make it something observable: command output, a file's contents, text on screen.
- **`needs="user"`** marks a step only a person can do, such as signing in or changing an admin setting. The agent tells the user what to do and waits.
- **`confirm`** marks a step that changes or deletes something the user may want to keep, such as a production deploy. The agent asks first.
- **`symptoms`** lists the symptoms to try when the check fails; without it, the agent gets the whole list.

Use [`ForAgents`](./writing-for-agents.md) inside a step for what only an agent needs, such as when to stop and hand back to the user, and `ForHumans` for directions that only make sense on screen.

Write steps that work:

- **One action per step.** If a step can fail in two places, split it.
- **Describe; don't command.** Write steps the way you would for a person. Text addressed to "the AI" telling it to run things right away looks like prompt injection to hosts.
- **Keep guides to Markdown.** Hosts treat served skills as untrusted and won't run bundled scripts without asking the user.

<Check>

Every `Step` has an `id`, a title or heading, and a `Check`.

</Check>

</Step>

<Step id="symptoms" symptoms="invalid-guides">

## 3. Add troubleshooting

A `Symptom` is one thing that can go wrong: what the user sees, why, how to fix it, and when to give up and escalate. Symptoms usually live on a troubleshooting page and attach to their guide by name. An existing section can be wrapped as it is; its heading becomes the title:

```mdx
<Symptom id="not-found" guide="setup-widget">

## `command not found: widget`

**Cause:** npm's global bin directory isn't on the `PATH`.

**Fix:** Open a new terminal, or add `$(npm prefix -g)/bin` to the `PATH`.

<Check>

`widget --version` prints a version number.

</Check>

**Escalate if:** the command is still missing after a new terminal.

</Symptom>
```

- **Start the title with the exact error text.** Agents match errors by searching for what they saw.
- **Label the parts.** The build reads **Cause:**, **Fix:**, and **Escalate if:** from paragraphs that start with them.
- **Share symptoms.** A symptom several guides share, like a deployment error that happens on every platform, names them all: `guide="deploy-vercel deploy-netlify"`. Each guide gets it, and you write it once.

<Check>

Each `Symptom` has an `id`, a title or heading that starts with what the user sees, and a `guide` naming the guides it belongs to (or sits inside its guide).

</Check>

</Step>

<Step id="build" symptoms="invalid-guides guide-warnings">

## 4. Build

```bash
npm run build
```

The build reads guides from the built HTML and compiles each into a skill named after the guide. It fails, listing every problem at once, when a guide is malformed, and warns about what makes a guide weaker, such as a step without a `Check`. `npx docusaurus-mcp-verify` repeats the warnings for an existing build.

<Check>

The build log has `[MCP] Packaged N skill(s), including M agent guide(s)`, with your guide counted, and no `[MCP] Agent guide:` warnings.

</Check>

</Step>

<Step id="read">

## 5. Read it as an agent

The compiled guide is in the bundle. Print its `SKILL.md`:

```bash
jq -r '.skills.skills[] | select(.skillPath == "setup-widget") | .files[] | select(.path == "SKILL.md") | .text' build/mcp/bundle.json
```

Or run the server locally ([Getting started](../getting-started.md#4-run-the-server-locally)) and ask a connected agent to fetch `skill://setup-widget/SKILL.md` with `docs_fetch`. Links in a compiled guide are absolute URLs, so the guide still works when an agent reads it away from your site.

<Check>

The compiled `SKILL.md` lists every step in page order, each with its check, and its troubleshooting links to the symptoms you attached.

</Check>

</Step>

## Troubleshooting

<Symptom id="invalid-guides">

### `[MCP] Invalid agent guides:` and the build fails

**Cause:** A guide breaks one of the format's rules. The error lists each problem with its page, for example a guide with no `description`, a step with no `id`, a `symptoms` prop naming a symptom that doesn't exist, or a `Step` outside an `AgentGuide`.

**Fix:** Fix each listed problem on the page it names, then build again. A guide's `name` can't match another skill's (the build reports that as a skill name collision), so rename one.

<Check>

`npm run build` completes.

</Check>

</Symptom>

<Symptom id="guide-warnings">

### `[MCP] Agent guide:` warnings in the build log

**Cause:** The guide compiles, but something makes it weaker: a step without a `Check`, a guide without symptoms, guide markup outside the page's content element, or guides on a site with skills turned off (`skills: false`), where they aren't served.

**Fix:** Add what the warning names. For markup outside the content element, move it into the page's content, or adjust [`contentSelectors`](../reference/plugin-options.md).

<Check>

The build log has no `[MCP] Agent guide:` lines.

</Check>

</Symptom>

<Symptom id="markdown-as-text">

### Markdown inside a component shows as plain text, like `**Fix:**` or a code fence

**Cause:** MDX parses a component's content as Markdown only when there's a blank line after the opening tag and before the closing tag.

**Fix:** Add the blank lines, and put each component tag on its own line.

<Check>

The rendered page shows the formatting, and so does the compiled `SKILL.md`.

</Check>

</Symptom>

<Symptom id="missing-component">

### `Expected component Step to be defined`

**Cause:** The page uses a guide component that MDX doesn't know. Either the `mdxComponents` plugin option is `false`, or the site has an ejected `MDXComponents` that replaces the plugin's.

**Fix:** Import the components in the page (`import { AgentGuide, Step, Check } from 'docusaurus-plugin-mcp-server/theme'`), or spread `mdxComponents` into your `MDXComponents` ([MDX components](../reference/plugin-options.md#mdx-components)).

<Check>

The page builds.

</Check>

</Symptom>

</AgentGuide>

## Reference

- Guides are skills, so they're served only when skills are on (the default).
- The complete format, including the compiled `SKILL.md` layout and every build check, is in [the agent guide format](https://github.com/scalvert/docusaurus-plugin-mcp-server/blob/main/docs/agent-guide-format.md).
