---
title: Agent guides
description: Mark up a setup or troubleshooting page so the build compiles it into an Agent Skill that agents can follow, step by step.
---

# Agent guides

An agent guide is a setup or troubleshooting procedure, written in the docs page people already read, that the build compiles into an [Agent Skill](./agent-skills.md). Agents get the steps, how to check each one worked, and what to do when a check fails. People reading the page see the same steps they always did, so the two can't drift apart.

This site's [Getting started](../getting-started.md) page is a guide: the server serves it as the `setup-docusaurus-mcp` skill, with symptoms from [Troubleshooting deployments](../deploy/troubleshooting.md).

## Write a setup guide

Wrap the procedure in `AgentGuide`, and each step in `Step`:

````mdx
import { AgentGuide, Check, DoneWhen, Step } from 'docusaurus-plugin-mcp-server/theme';

<AgentGuide
  name="setup-widget"
  kind="setup"
  description="Install the widget CLI. Use when the user wants to install or set up the widget.">

<DoneWhen>

`widget --version` prints a version number.

</DoneWhen>

<Step id="install" symptoms="not-found">

## 1. Install the CLI

```bash
npm install -g widget
```

<Check>

`widget --version` prints a version number.

</Check>

</Step>

</AgentGuide>
````

- **`name`** becomes the skill's name: lowercase letters, digits, and single hyphens.
- **`description`** is what an agent reads to decide whether to use the guide. Say what it does, then "Use when…".
- **`DoneWhen`** says how to tell the whole guide worked. Every guide has exactly one.
- **A step's title** is its `title` prop, or the first heading inside it. Wrapping existing headings, as above, keeps them in the page's table of contents. A leading `1.` is dropped, since the compiled guide numbers steps itself.
- **`Check`** says how to tell a step worked. Make it something observable: command output, a file's contents, text on screen.

Leave a blank line after each opening tag and before each closing tag, so the Markdown inside is parsed as Markdown.

### Steps a person has to do

- `needs="user"` marks a step only a person can do, such as signing in or changing an admin setting. The agent tells the user what to do and waits.
- `confirm` marks a step that changes or deletes something the user may want to keep. The agent asks first.

Use [`ForAgents`](./writing-for-agents.md) inside a step for what only an agent needs, such as when to stop and hand back to the user.

## Add troubleshooting

A `Symptom` is one thing that can go wrong: what the user sees, why, how to fix it, and when to give up and escalate. Symptoms usually live on a troubleshooting page and attach to their guide by name. An existing section can be wrapped as it is; its heading becomes the title:

```mdx
import { Check, Symptom } from 'docusaurus-plugin-mcp-server/theme';

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

Start symptom titles with the exact error text: agents match errors by searching for what they saw. A step's `symptoms` prop lists the symptoms to try when its check fails; without it, the agent gets the whole list.

A troubleshooting guide (`kind="troubleshooting"`) has symptoms and no steps, for problems that aren't tied to one setup.

## What the build does

The build reads guides from the built HTML, compiles each into a skill named after the guide, and serves it with your other skills. Agents read it with `docs_fetch` (`skill://setup-widget/SKILL.md`) or the skills extension.

It fails, listing every problem, when a guide is malformed: a missing `name`, `kind`, `description`, or `DoneWhen`; a step or symptom without an `id`; a `symptoms` prop naming a symptom that doesn't exist; a guide name that's already a skill; or markup in the wrong place, such as a `Step` outside a guide. It warns when a step has no `Check` or a guide has no symptoms. `docusaurus-mcp-verify` repeats the warnings for an existing build.

Guides are skills, so they're served only when skills are on (the default).

## Write guides that work

- **One action per step.** If a step can fail in two places, split it.
- **Describe; don't command.** Write steps the way you would for a person. Text addressed to "the AI" telling it to run things right away looks like prompt injection to hosts.
- **Keep guides to Markdown.** Hosts treat served skills as untrusted and won't run bundled scripts without asking the user.

The complete format, including the compiled `SKILL.md` layout, is in [the agent guide format](https://github.com/scalvert/docusaurus-plugin-mcp-server/blob/main/docs/agent-guide-format.md).
