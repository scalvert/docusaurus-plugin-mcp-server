---
title: Agent Skills
description: Serve the built-in docs-research skill, write your own, and how skills reach MCP clients.
---

# Agent Skills

Tool descriptions tell an agent what `docs_search` and `docs_fetch` do, not how to research your docs well. The server can also ship that guidance as [Agent Skills](https://agentskills.io), through the MCP skills extension ([SEP-2640](https://modelcontextprotocol.io/seps/2640-skills-extension), `io.modelcontextprotocol/skills`).

## The built-in `docs-research` skill

By default the plugin packages one skill, `docs-research`, which covers the search → fetch → cite workflow for your site. It's generated from your site at build time:

- Its description names your docs, host, and `tagline`, for example "Answer questions using the Acme documentation at acme.dev (Build faster)". Agents read the description to decide when to load the skill.
- A **Where things are** section groups the indexed pages by URL path, largest sections first. Each section lists its page count, a link to its overview page if there is one, and a few example page titles. It's left out when the pages don't form at least two multi-page sections.

The built-in skill is generic by design. For a skill that knows your product (its terminology, where each topic lives, the questions people actually ask), **write your own `docs-research` skill. It replaces the built-in one.** Start from a copy of [`skills-builtin/docs-research/`](https://github.com/scalvert/docusaurus-plugin-mcp-server/blob/main/skills-builtin/docs-research/SKILL.md).

## Add your own skills

Put each skill in its own directory with a `SKILL.md` at its root, and point the plugin at the parent directory:

```javascript snippet=readme/snippet-20.js
// docusaurus.config.js
module.exports = {
  plugins: [
    [
      'docusaurus-plugin-mcp-server',
      {
        server: { name: 'my-docs' },
        // Serve the built-in docs-research skill plus every skill in ./mcp-skills
        skills: { dir: 'mcp-skills' },
      },
    ],
  ],
};
```

```text
mcp-skills/
└── api-migration/
    ├── SKILL.md            # YAML frontmatter with name + description, then instructions
    └── references/
        └── v1-to-v2.md
```

At build time the plugin:

- validates every skill. The frontmatter `name` must match the directory name, and a skill can have at most 512 files and 16 MiB. Invalid skills fail the build with a `SkillValidationError`.
- skips symlinks, and packages bundled scripts (`.sh`, `.py`, `.js`, …) with a warning.
- precomputes SHA-256 digests and adds the skills to the artifact bundle, so the handler serves them with no extra config.

If you copy the built-in skill, replace its placeholders (`{{siteDocs}}`, `{{siteSummary}}`, `{{siteMap}}`) with your own wording. They're only filled in for the built-in copy.

| Setting | Result |
| --- | --- |
| _(default)_ | Built-in `docs-research` only |
| `skills: { dir: 'mcp-skills' }` | Built-in skill plus yours. An author skill named `docs-research` replaces the built-in one |
| `skills: { builtin: false, dir: 'mcp-skills' }` | Only your skills |
| `skills: false` | No skills |

## How clients get skills

At runtime the server:

- declares the `io.modelcontextprotocol/skills` extension and implements `skills/list` and `skills/get`.
- serves every skill file as a resource at `skill://<name>/<path>`, for example `skill://docs-research/SKILL.md`.
- appends the skill URIs to the server `instructions`, so clients that don't support the extension yet can still find the skills and load them with `resources/read`.

Keep skills to Markdown. MCP hosts treat served skills as untrusted input and won't run bundled scripts without the user's explicit approval.
