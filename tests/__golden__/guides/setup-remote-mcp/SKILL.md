---
name: setup-remote-mcp
description: Connect an MCP host to Glean's remote MCP server. Use when the user wants to install, set up, or connect Glean MCP.
metadata:
  agent-guide: setup
  agent-guide-format: "1"
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

```bash
claude mcp add --transport http glean https://example-be.glean.com/mcp/default
```

**Check:** `claude mcp list` shows `glean` as connected.

**If the check fails:** see [`401 invalid_token` when the host connects](references/troubleshooting.md#invalid-token).

### 3. Restart the host {#restart-host}

**Confirm first.**

Quit and reopen the host. Unsaved work in the host is lost.

## Troubleshooting

- [`401 invalid_token` when the host connects](references/troubleshooting.md#invalid-token)

## Source

Generated from https://developers.glean.com/guides/mcp/setup. If a step doesn't match what the user sees, tell them, and point them to that page.
