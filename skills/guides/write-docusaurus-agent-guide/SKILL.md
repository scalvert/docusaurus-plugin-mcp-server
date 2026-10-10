---
name: write-docusaurus-agent-guide
description: Turn a setup or troubleshooting procedure in a Docusaurus page into an agent guide with docusaurus-plugin-mcp-server's AgentGuide, Step, Check, and Symptom components, then build and read the compiled skill. Use when the user wants to write, add, or fix an agent guide, or make a docs procedure something AI agents can follow.
metadata:
  agent-guide: setup
  agent-guide-format: "1"
  source: https://docusaurus-plugin-mcp-server.vercel.app/docs/guides/agent-guides
---

# Write an agent guide

## Done when

`npm run build` logs `[MCP] Packaged N skill(s), including M agent guide(s)` with no `[MCP] Agent guide:` warnings, and the compiled `SKILL.md` lists every step in order, each with its check.

## Before you start

- The site builds with the plugin: `npm run build` writes `build/mcp/bundle.json`. If not, follow [Getting started](https://docusaurus-plugin-mcp-server.vercel.app/docs/getting-started) first.
- A procedure for one task, with an end someone can see: a command's output, a page that loads, a setting that shows as on.

## How to use this guide

- Do the steps in order. Run them yourself, or walk the user through them one at a time if they'd rather do it themselves or you can't run them.
- After each step, run its check. Don't move on until it passes.
- If a check fails, look for the matching symptom under Troubleshooting. If none matches, stop and tell the user what you saw.
- A step marked **Needs the user** needs a person. Tell the user what to do and wait for them to confirm it's done.
- Ask the user before running a step marked **Confirm first**.
- Don't ask the user to paste passwords, tokens, or keys into the chat. When a step needs one, tell the user where to put it.

## Steps

### 1. Wrap the procedure {#wrap}

Wrap the procedure in `AgentGuide` and say how to tell it worked with `DoneWhen`. The components need no import; the plugin adds them to your theme's MDX components:

```mdx
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
```

- **`name`** becomes the skill's name: lowercase letters, digits, and single hyphens. Make it specific enough to stand out among the other skills an agent has installed.
- **`kind`** is `setup` for a procedure with steps, or `troubleshooting` for symptoms only, for problems that aren't tied to one setup.
- **`description`** is what an agent reads to decide whether to use the guide. Say what it does, then "Use when…".
- **`DoneWhen`** says how to tell the whole guide worked. Every guide has exactly one.
- **`Prerequisites`** is optional: what has to be true before step 1, each with how to check it.

Leave a blank line after each opening tag and before each closing tag, so the Markdown inside is parsed as Markdown.

**Check:** The page has one `AgentGuide` with a `name`, `kind`, and `description`, and one `DoneWhen` inside it.

**If the check fails:** see [`[MCP] Invalid agent guides:` and the build fails](references/troubleshooting.md#invalid-guides).

### 2. Mark up each step {#steps}

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

Use [`ForAgents`](https://docusaurus-plugin-mcp-server.vercel.app/docs/guides/writing-for-agents) inside a step for what only an agent needs, such as when to stop and hand back to the user, and `ForHumans` for directions that only make sense on screen.

Write steps that work:

- **One action per step.** If a step can fail in two places, split it.
- **Describe; don't command.** Write steps the way you would for a person. Text addressed to "the AI" telling it to run things right away looks like prompt injection to hosts.
- **Keep guides to Markdown.** Hosts treat served skills as untrusted and won't run bundled scripts without asking the user.

**Check:** Every `Step` has an `id`, a title or heading, and a `Check`.

**If the check fails:** see [Markdown inside a component shows as plain text, like `**Fix:**` or a code fence](references/troubleshooting.md#markdown-as-text) or [`Expected component Step to be defined`](references/troubleshooting.md#missing-component).

### 3. Add troubleshooting {#symptoms}

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

**Check:** Each `Symptom` has an `id`, a title or heading that starts with what the user sees, and a `guide` naming the guides it belongs to (or sits inside its guide).

**If the check fails:** see [`[MCP] Invalid agent guides:` and the build fails](references/troubleshooting.md#invalid-guides).

### 4. Build {#build}

```bash
npm run build
```

The build reads guides from the built HTML and compiles each into a skill named after the guide. It fails, listing every problem at once, when a guide is malformed, and warns about what makes a guide weaker, such as a step without a `Check`. `npx docusaurus-mcp-verify` repeats the warnings for an existing build.

**Check:** The build log has `[MCP] Packaged N skill(s), including M agent guide(s)`, with your guide counted, and no `[MCP] Agent guide:` warnings.

**If the check fails:** see [`[MCP] Invalid agent guides:` and the build fails](references/troubleshooting.md#invalid-guides) or [`[MCP] Agent guide:` warnings in the build log](references/troubleshooting.md#guide-warnings).

### 5. Read it as an agent {#read}

The compiled guide is in the bundle. Print its `SKILL.md`:

```bash
jq -r '.skills.skills[] | select(.skillPath == "setup-widget") | .files[] | select(.path == "SKILL.md") | .text' build/mcp/bundle.json
```

Or run the server locally ([Getting started](https://docusaurus-plugin-mcp-server.vercel.app/docs/getting-started#4-run-the-server-locally)) and ask a connected agent to fetch `skill://setup-widget/SKILL.md` with `docs_fetch`. Links in a compiled guide are absolute URLs, so the guide still works when an agent reads it away from your site.

**Check:** The compiled `SKILL.md` lists every step in page order, each with its check, and its troubleshooting links to the symptoms you attached.

**If the check fails:** see [Troubleshooting](references/troubleshooting.md).

## Troubleshooting

- [`[MCP] Invalid agent guides:` and the build fails](references/troubleshooting.md#invalid-guides)
- [`[MCP] Agent guide:` warnings in the build log](references/troubleshooting.md#guide-warnings)
- [Markdown inside a component shows as plain text, like `**Fix:**` or a code fence](references/troubleshooting.md#markdown-as-text)
- [`Expected component Step to be defined`](references/troubleshooting.md#missing-component)

## Source

Generated from https://docusaurus-plugin-mcp-server.vercel.app/docs/guides/agent-guides. If a step doesn't match what the user sees, tell them, and point them to that page.
