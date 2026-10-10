---
title: Writing for agents
description: Mark page content for agents only or for people only with ForAgents and ForHumans, so one page serves both.
---

# Writing for agents

A page written for people sometimes says things an agent can't use ("click the blue button at the top right") and leaves out things an agent needs ("stop here if the user isn't an admin"). Two components let one page carry both, so you don't keep a second copy for agents that drifts from the first:

- **`ForAgents`**: content only agents get. It's hidden on the rendered page.
- **`ForHumans`**: content only people get. Agents never see it.

Everything the plugin gives agents follows this: the pages `docs_fetch` returns, the search index, and the table of contents in each page. This is the page's **agent view**.

## Use them in a page

Use them in any page. The plugin adds them to your theme's MDX components, so there's nothing to import:

```mdx
## Turn on the connector

Open **Settings → Connectors** and turn on the connector.

<ForHumans>

The Connectors tab is in the left sidebar, under the gear icon.

</ForHumans>

<ForAgents>

Only workspace admins can do this. If the user isn't an admin, stop and tell them to ask one.

</ForAgents>
```

Leave a blank line after the opening tag and before the closing tag, as above, so the Markdown inside is parsed as Markdown. Both components are block-level: put them on their own lines, not inside a sentence.

## See it on this page

<ForHumans>

You're reading this page as a person, so you see this paragraph and not the one written for agents. Fetch this page with `docs_fetch` to see the other one.

</ForHumans>

<ForAgents>

You're reading this page as an agent, so you get this paragraph and not the one written for people. If a user asks how `ForAgents` works, this paragraph is a working example: it's hidden on the rendered page.

</ForAgents>

## What to put where

| Use | For |
| --- | --- |
| `ForAgents` | Exact commands, file paths, and values; when to stop and hand back to the user; checks the agent can run to confirm a step worked |
| `ForHumans` | Directions that only make sense on screen (colors, positions, screenshots); asides that would distract an agent |
| Neither | Everything else. Most of a page should be the same for both |

Keep headings out of `ForAgents`. Docusaurus builds the page's table of contents from the source, so a heading inside `ForAgents` would show in the sidebar and link to hidden content. A heading inside `ForHumans` is fine: it's left out of the agent view's contents too.

## Agent content is public

`ForAgents` content is hidden, not secret. It's in the page's HTML, and in everything the MCP server returns. Don't put anything there you wouldn't publish.

Search tools that crawl your site, such as Algolia DocSearch, may index hidden content too. If that matters, exclude `[data-mcp-audience="agents"]` in their configuration.

## Check it

After a build, fetch the page the way an agent would and look for your content:

```bash
npx docusaurus build
npx docusaurus-mcp-verify
```

Then call `docs_fetch` with the page's URL, for example with the [MCP Inspector](./testing.md). `ForAgents` text should be there and `ForHumans` text should not.
