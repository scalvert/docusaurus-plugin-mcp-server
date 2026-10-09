---
name: docs-research
description: 'Answer questions using {{siteSummary}}. Use when the user asks about anything these docs cover, or wants answers backed by links to the docs.'
---

# Researching {{siteDocs}}

This MCP server exposes {{siteDocs}} through two tools:

- `docs_search`: full-text search across every page. Returns titles, URLs, matching sections, and snippets.
- `docs_fetch`: returns the complete markdown of one page, given its URL, or one section of it when the URL ends in `#heading-id`.

## Workflow

1. **Search first.** Call `docs_search` with a few specific keywords (product terms, API or option names, error strings) rather than a full sentence.
2. **Pick candidates.** Use titles, matching sections, and snippets to choose the one to three most relevant URLs. Snippets are excerpts, not answers.
3. **Fetch before answering.** Call `docs_fetch` with an exact URL from the results. The page starts with a contents list; focus on the sections that matter.
4. **Refine when results are thin.** Search again with synonyms, narrower terms, or terms you saw in fetched pages. Try two or three searches before concluding the docs don't cover something.
5. **Answer from the docs.** Ground the answer in fetched content and link the pages you used (add `#heading-id` anchors where useful). If the docs don't cover the question, say so instead of guessing.

{{siteMap}}

## Tips

- `docs_search` returns up to 16 results by default (max 20). Pass a smaller `limit` for focused lookups.
- Only pass URLs to `docs_fetch` that came from `docs_search` results, links in this skill, or links in fetched pages. Links from fetched pages work as written, including root-relative ones like `/docs/intro`.
- To read one part of a long page, add the section's `#heading-id` to its URL; `docs_fetch` then returns just that section.
- Prefer several targeted searches over one broad one; each search is cheap.

<!-- This is the built-in skill from docusaurus-plugin-mcp-server. To replace it, add your own docs-research skill to the plugin's skills `dir`. -->
