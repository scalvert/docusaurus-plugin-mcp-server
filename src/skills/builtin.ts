import { stringify as stringifyYaml } from 'yaml';

/** Name (and skill path) of the built-in skill */
export const BUILTIN_SKILL_NAME = 'docs-research';

export interface BuiltinSkillInput {
  /** Human-readable site name, e.g. the Docusaurus `siteConfig.title` */
  siteTitle: string;
}

/**
 * Render the built-in `docs-research` SKILL.md.
 *
 * It teaches an agent the search → fetch → cite workflow for this server's
 * `docs_search` and `docs_fetch` tools. Frontmatter is emitted with a YAML
 * serializer so arbitrary site titles are escaped correctly.
 */
export function renderBuiltinSkill({ siteTitle }: BuiltinSkillInput): string {
  const site = siteTitle.trim() || 'this site';
  const frontmatter = stringifyYaml(
    {
      name: BUILTIN_SKILL_NAME,
      description: `Answer questions about ${site} from its official documentation. Use when the user asks how ${site} works, how to install, configure, or use it, or wants answers backed by links to the docs.`,
    },
    { lineWidth: 0 }
  );

  return `---
${frontmatter.trimEnd()}
---

# Researching the ${site} documentation

This MCP server exposes the ${site} documentation through two tools:

- \`docs_search\`: full-text search across every page. Returns titles, URLs, matching sections, and snippets.
- \`docs_fetch\`: returns the complete markdown of one page, given its URL.

## Workflow

1. **Search first.** Call \`docs_search\` with a few specific keywords (product terms, API or option names, error strings) rather than a full sentence.
2. **Pick candidates.** Use titles, matching sections, and snippets to choose the one to three most relevant URLs. Snippets are excerpts, not answers.
3. **Fetch before answering.** Call \`docs_fetch\` with an exact URL from the results. The page starts with a contents list; focus on the sections that matter.
4. **Refine when results are thin.** Search again with synonyms, narrower terms, or terms you saw in fetched pages. Try two or three searches before concluding the docs don't cover something.
5. **Answer from the docs.** Ground the answer in fetched content and link the pages you used (add \`#heading-id\` anchors where useful). If the docs don't cover the question, say so instead of guessing.

## Tips

- \`docs_search\` returns up to 16 results by default (max 20). Pass a smaller \`limit\` for focused lookups.
- Only pass URLs to \`docs_fetch\` that came from \`docs_search\` results or from links in fetched pages.
- Prefer several targeted searches over one broad one; each search is cheap.
`;
}
