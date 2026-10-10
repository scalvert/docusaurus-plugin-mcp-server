---
status: accepted
formatVersion: 1
---

# Agent guide format

An **agent guide** is a procedure an AI agent can carry out for a user, or walk the user through: setting something up, or getting unstuck when setup fails. You write the guide inside the docs page that people already read. At build time the plugin pulls it out of the page and packages it as an [Agent Skill](https://agentskills.io), which the server serves like any other skill. Agents get the steps, how to check each one, and what to do when a check fails. People reading the page see the same steps they always did.

This document defines version 1 of the format: how a guide is marked up in a page, what the build checks, and what the compiled skill looks like.

## Kinds of guide

| Kind | What it's for | Contains |
|---|---|---|
| `setup` | Getting from nothing to a working setup | Steps, each with a check, plus symptoms for when a check fails |
| `troubleshooting` | Diagnosing a problem the user already has | Symptoms only |

## Marking up a page

Import the components from `docusaurus-plugin-mcp-server/theme`, or register them once in a swizzled `src/theme/MDXComponents`.

````mdx
import {
  AgentGuide,
  DoneWhen,
  Prerequisites,
  Step,
  Check,
  Symptom,
  ForAgents,
  ForHumans,
} from 'docusaurus-plugin-mcp-server/theme';

<AgentGuide
  name="setup-remote-mcp"
  kind="setup"
  description="Connect an MCP host to Glean's remote MCP server. Use when the user wants to install, set up, or connect Glean MCP.">

<DoneWhen>The host lists Glean's tools, and a test search returns results.</DoneWhen>

<Prerequisites>

- A Glean account. Check: the user can sign in at `app.glean.com`.
- Remote MCP is turned on for the user's company. Only a Glean admin can check this.

</Prerequisites>

<Step id="open-configurator" title="Open the MCP Configurator" needs="user">

Go to **Admin console → Platform → MCP**.

<ForHumans>The Configurator is the **Configure** button at the top right.</ForHumans>

<ForAgents>If the user isn't a Glean admin, stop here and tell them an admin has to do this step.</ForAgents>

<Check>The page shows a server URL ending in `/mcp/default`.</Check>

</Step>

<Step id="add-server" title="Add the server to the host" symptoms="invalid-token">

```bash
claude mcp add --transport http glean https://example-be.glean.com/mcp/default
```

<Check>`claude mcp list` shows `glean` as connected.</Check>

</Step>

</AgentGuide>
````

Symptoms usually live on the troubleshooting page and attach to their guide by name:

```mdx
<Symptom id="invalid-token" guide="setup-remote-mcp" title="`401 invalid_token` when the host connects">

**Cause:** The host is sending a token from a different Glean instance.

**Fix:** Remove the server from the host, add it again with the URL from the Configurator, and sign in when the host asks.

<Check>`claude mcp list` shows `glean` as connected.</Check>

**Escalate if:** the error persists after signing in again. The company's SSO settings may block the host.

</Symptom>
```

Leave a blank line after an opening tag and before a closing tag so MDX parses the Markdown inside.

### The contract is the HTML

The components only render HTML with `data-mcp-*` attributes, and the build reads those attributes from the built page. Any component that renders the same attributes works, so a site with its own `<Steps>` component can add them instead of using ours.

| Component | Attribute it renders | Allowed inside | Props |
|---|---|---|---|
| `AgentGuide` | `data-mcp-guide="<name>"` | the page | `name` (required), `kind` (required), `description` (required), `title` |
| `DoneWhen` | `data-mcp-done-when` | a guide | |
| `Prerequisites` | `data-mcp-prerequisites` | a setup guide | |
| `Step` | `data-mcp-step="<id>"` | a setup guide | `id` (required), `title`, `needs="user"`, `confirm`, `symptoms` |
| `Check` | `data-mcp-check` | a step or a symptom | |
| `Symptom` | `data-mcp-symptom="<id>"` | a guide, or anywhere with `guide` set | `id` (required), `title` (required), `guide` |
| `ForAgents` | `data-mcp-audience="agents"` and `hidden` | anywhere, as a block (not inside a sentence) | |
| `ForHumans` | `data-mcp-audience="humans"` | anywhere, as a block (not inside a sentence) | |

Props map to attributes of the same name: `kind` renders `data-mcp-guide-kind`, a step's `title` renders `data-mcp-step-title`, and so on. Inside a symptom, the build reads **Cause:**, **Fix:**, and **Escalate if:** from paragraphs that start with those bold labels.

- **Guide title:** the `title` prop, else the page's `h1`.
- **Step title:** the `title` prop, else the first heading inside the step. Wrapping an existing `### Open the MCP Configurator` heading in a `<Step>` keeps it in the page's table of contents.
- **`needs="user"`:** a person has to do this step, for example signing in, approving access, or changing an admin-only setting. The agent tells the user what to do and waits for them to confirm.
- **`confirm`:** the step changes or deletes something the user may want to keep. The agent asks before running it.
- **`symptoms`:** space-separated symptom IDs to offer when this step's check fails. Without it, the step points at the whole troubleshooting list.

## The agent view

Everything the plugin produces for agents is the **agent view** of a page: `ForAgents` content is included, and `ForHumans` content is left out. That covers the documents `docs_fetch` returns, the search index, and compiled guides. People see the opposite: `ForAgents` content is `hidden` on the rendered page.

`ForAgents` and `ForHumans` shipped ahead of the guide components (#173): the attribute contract is `src/agent-view/audience.ts`, and documents already use the agent view. Guides reuse both unchanged.

Agent-only content is still public: it's in the page HTML and in the compiled guide, both linked from the page. Use it for what an agent needs and a person doesn't: exact commands, file paths, when to stop and hand back to the user. Use `ForHumans` for directions that only make sense on screen, like "the blue button at the top right".

## Build checks

The build fails with a `GuideValidationError` when:

- a guide has no `name`, `kind`, or `description`, or its `name` isn't a valid skill name (lowercase letters, digits, and single hyphens, at most 64 characters)
- two guides share a name, or a guide's name matches a skill in the plugin's skills `dir`
- a guide has no `DoneWhen`, or has more than one
- a setup guide has no steps, or a troubleshooting guide has steps
- a step or symptom has no `id`, or two steps or two symptoms in the same guide share one
- a symptom names a guide that doesn't exist, or a step's `symptoms` names a symptom the guide doesn't have
- a `Step`, `Check`, or `Symptom` sits somewhere the table above doesn't allow, or guides are nested

The build warns when:

- a step has no `Check`
- a guide has no symptoms
- `data-mcp-*` attributes appear outside the page's content element (set by the plugin's `contentSelectors`). They're ignored.

`docusaurus-mcp-verify` reports the same warnings for an existing build.

## The compiled skill

Each guide becomes one skill named after the guide:

```
setup-remote-mcp/
├── SKILL.md
└── references/
    └── troubleshooting.md    # only when the guide has symptoms
```

### `SKILL.md` for a setup guide

```markdown
---
name: setup-remote-mcp
description: Connect an MCP host to Glean's remote MCP server. Use when the user wants to install, set up, or connect Glean MCP.
metadata:
  agent-guide: setup
  agent-guide-format: '1'
  source: https://developers.glean.com/guides/mcp/setup
---

# Connect an MCP host to Glean

## Done when

The host lists Glean's tools, and a test search returns results.

## Before you start

- A Glean account. Check: the user can sign in at `app.glean.com`.
- Remote MCP is turned on for the user's company. Only a Glean admin can check this.

## How to use this guide

- Do the steps in order. Run them yourself, or walk the user through them one at a time if they'd rather do it themselves or you can't run them.
- After each step, run its check. Don't move on until it passes.
- If a check fails, look for the matching symptom under Troubleshooting. If none matches, stop and tell the user what you saw.
- A step marked **Needs the user** needs a person. Tell the user what to do and wait for them to confirm it's done.
- Ask the user before running a step marked **Confirm first**.
- Don't ask the user to paste passwords, tokens, or keys into the chat. When a step needs one, tell the user where to put it.

## Steps

### 1. Open the MCP Configurator {#open-configurator}

**Needs the user.**

Go to **Admin console → Platform → MCP**.

If the user isn't a Glean admin, stop here and tell them an admin has to do this step.

**Check:** The page shows a server URL ending in `/mcp/default`.

**If the check fails:** see [Troubleshooting](references/troubleshooting.md).

### 2. Add the server to the host {#add-server}

…

**If the check fails:** see [`401 invalid_token` when the host connects](references/troubleshooting.md#invalid-token).

## Troubleshooting

- [`401 invalid_token` when the host connects](references/troubleshooting.md#invalid-token)

## Source

Generated from https://developers.glean.com/guides/mcp/setup. If a step doesn't match what the user sees, tell them, and point them to that page.
```

The sections always come in this order. "Before you start" and "Troubleshooting" are left out when they'd be empty. The "How to use this guide" text is fixed by the format version, not written by the author. Step IDs use the `{#id}` heading syntax Docusaurus already uses for explicit heading IDs.

### `SKILL.md` for a troubleshooting guide

The same frontmatter (with `agent-guide: troubleshooting`), title, "Done when", "Troubleshooting", and "Source" sections, with no steps. Its "How to use this guide" text is:

- Ask the user what they see, or read the error yourself, and match it to a symptom below. Error text is quoted exactly, so search for it.
- Apply the fix, then run the symptom's check.
- If nothing matches, or the check still fails, stop and tell the user what you saw.

### `references/troubleshooting.md`

```markdown
# Troubleshooting: Connect an MCP host to Glean

## `401 invalid_token` when the host connects {#invalid-token}

**Cause:** The host is sending a token from a different Glean instance.

**Fix:** Remove the server from the host, add it again with the URL from the Configurator, and sign in when the host asks.

**Check:** `claude mcp list` shows `glean` as connected.

**Escalate if:** the error persists after signing in again. The company's SSO settings may block the host.

Source: https://developers.glean.com/guides/mcp/troubleshooting#invalid-token
```

## Writing guides that work

- **Make every check observable.** Name command output, a file's contents, or text on screen. "It works" isn't a check.
- **One action per step.** If a step has two places it can fail, split it.
- **Start symptom titles with the exact error text.** Agents match errors by searching for the text they saw.
- **Mark people's steps with `needs="user"`, not prose.** The marker is what tells the agent to stop and hand over.
- **Describe; don't command.** Write steps the way you'd write them for a person. Don't add text addressed to "the AI" that tells it to install or run things right away. Hosts treat that as prompt injection.
- **Keep guides to Markdown.** Hosts treat served skills as untrusted and won't run bundled scripts without the user's approval.

## Relationship to install.md

[install.md](https://github.com/mintlify/install-md) is a proposed single file of installation instructions for agents. Its sections map onto a setup guide:

| install.md | Agent guide |
|---|---|
| OBJECTIVE | the guide's `description` |
| DONE WHEN | `DoneWhen` |
| TODO | the step titles |
| Detailed steps | the steps |

Agent guides differ in three ways. They support walking the user through the steps as well as running them. They mark the steps a person has to do. And they carry troubleshooting, which install.md leaves out. Format version 1 doesn't write `install.md`. A later version could write one from a site's main setup guide.

## Versioning

The compiled skill records the format version in `metadata.agent-guide-format`. A change to the markup, the build checks, or the compiled layout that would break an existing page or an agent's reading of a guide needs a new format version.
