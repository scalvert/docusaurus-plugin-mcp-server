---
title: Connecting AI tools
description: Add a docs MCP endpoint to Claude Code, Cursor, VS Code, Codex, Gemini CLI, Windsurf, and Claude Desktop.
---

# Connecting AI tools

Every client needs the endpoint URL, such as `https://docs.example.com/mcp`, and a name for the server. Replace `my-docs` and the URL below with yours. To connect to these docs, use `https://docusaurus-plugin-mcp-server.vercel.app/mcp`.

The [install button](./install-button.md) generates all of these for your readers, with your URL and name filled in.

## Claude Code

```bash
claude mcp add --transport http my-docs https://docs.example.com/mcp
```

Add `--scope user` to make it available in every project, or `--scope project` to write it to the project's `.mcp.json` and share it with your team.

## Cursor

Add to `~/.cursor/mcp.json`, or `.cursor/mcp.json` in a project:

```json snippet=readme/snippet-07.json
{
  "mcpServers": {
    "my-docs": {
      "url": "https://docs.example.com/mcp"
    }
  }
}
```

## VS Code

```bash
code --add-mcp '{"name":"my-docs","type":"http","url":"https://docs.example.com/mcp"}'
```

Or add it to `.vscode/mcp.json` in a workspace. VS Code uses `servers`, not `mcpServers`:

```json title=".vscode/mcp.json"
{
  "servers": {
    "my-docs": {
      "type": "http",
      "url": "https://docs.example.com/mcp"
    }
  }
}
```

## Codex

```bash
codex mcp add --url https://docs.example.com/mcp my-docs
```

Or in `~/.codex/config.toml`:

```toml title="~/.codex/config.toml"
[mcp_servers.my-docs]
url = "https://docs.example.com/mcp"
```

## Gemini CLI

```bash
gemini mcp add --transport http my-docs https://docs.example.com/mcp
```

## Windsurf

Add to `~/.codeium/windsurf/mcp_config.json`:

```json
{
  "mcpServers": {
    "my-docs": {
      "serverUrl": "https://docs.example.com/mcp"
    }
  }
}
```

## Claude Desktop and claude.ai

Add the URL as a custom connector in **Settings → Connectors**. For a config file setup without connectors, Claude Desktop can reach a remote server through [`mcp-remote`](https://www.npmjs.com/package/mcp-remote):

```json title="claude_desktop_config.json"
{
  "mcpServers": {
    "my-docs": {
      "command": "npx",
      "args": ["-y", "mcp-remote", "https://docs.example.com/mcp"]
    }
  }
}
```

## Other clients

Any client that supports the Streamable HTTP transport can connect with just the URL. The endpoint needs no authentication or session setup.

## What to ask

Once connected, ask questions your docs answer. The agent calls `docs_search`, then `docs_fetch` on the best matches, and cites the pages it used. Clients that support the [skills extension](./agent-skills.md) also load the `docs-research` skill, which walks the agent through that workflow.
