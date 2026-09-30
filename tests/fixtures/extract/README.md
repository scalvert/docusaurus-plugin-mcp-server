# Extract fixture: `site/`

This is a Docusaurus build output (HTML only) for the page-extraction golden test (HTML -> ProcessedDoc). It is built from `examples/basic-docs` with extra pages added, and then stripped of every `<script>`, `<link>` and `<style>` element. Nothing else was changed: all other bytes match the build output exactly.

- Docusaurus: **3.9.2** (`@docusaurus/core`, `@docusaurus/preset-classic`, `@docusaurus/theme-mermaid`)
- Node: v24.18.1, built on macOS arm64
- Files: 14, total: 173387 bytes (169.3 KiB)

## Files

| File | Bytes | Covers |
| --- | ---: | --- |
| `404.html` | 5158 | Docusaurus 404 page ("Page Not Found"). Typically excluded by route (/404*). |
| `assets/ignored.html` | 367 | Handmade. Page under assets/, has an <article> with plenty of text. Should be skipped. |
| `docs/api/authentication/index.html` | 26353 | Original example doc: h2/h3, two tables, bash and js code blocks. |
| `docs/api/endpoints/index.html` | 34314 | Original example doc, the largest page: h2 plus 8 h3, two tables, bash/http/json code blocks. |
| `docs/getting-started/configuration/index.html` | 28032 | Original example doc: h2/h3, one table, js code blocks. |
| `docs/getting-started/installation/index.html` | 19452 | Original example doc: category route, 5 h2, bash and js code blocks. |
| `docs/intro/index.html` | 12299 | Original example doc: 4 h2 sections, bullet list with bold, unlabeled (language-text) code block. |
| `docs/nested/deep/index.html` | 9931 | Nested route /docs/nested/deep; h2 plus a list. |
| `docs/rich/index.html` | 22134 | Feature coverage page (docs/rich.mdx): :::note, :::tip, :::warning[Careful Now]; Tabs/TabItem (npm/Yarn, the second panel rendered with `hidden`); <details><summary>; GFM table; task list; footnote (section.footnotes plus sr-only "footnote-label" h2); duplicate "## Setup" -> ids `setup` and `setup-1`; custom id `my-custom-id`; h2/h3/h4; bash code block with title and lines `# Install it` / `## not a heading`; js code block; inline code, bold/italic, relative link (-> /docs/getting-started/installation), absolute link (https://docusaurus.io/docs), remote image with alt; &amp; / &lt; entities, &nbsp; (rendered as a literal U+00A0), <br>, two-paragraph blockquote; a mermaid block (renders as empty in static HTML, see Notes). |
| `docs/tiny/index.html` | 8784 | Very little content ("# Tiny" plus "Short page."). Should fall below the min-content-length threshold. |
| `foo.html` | 261 | Handmade. Flat-file variant of route /foo (h1 "Foo Flat"). Route-dedup test, paired with foo/index.html. |
| `foo/index.html` | 284 | Handmade. Directory-index variant of route /foo (h1 "Foo Directory"). Route-dedup test. |
| `index.html` | 5424 | Home page (src/pages/index.md, a Markdown page): MDXPage layout with <main> and <article>, an h1 and one short paragraph with a link. |
| `no-article.html` | 594 | Handmade. No <article> or <main>; more than 300 chars of text inside a <div>. Tests the fallback selector. |

## How it was built

Run from fish shell. The helper scripts are in `tools/` next to this file.

```sh
git clone /Users/stevecalvert/workspace/personal/docusaurus-plugin-mcp-server /tmp/fixture-src
cd /tmp/fixture-src/examples/basic-docs
python3 /tmp/fixture-setup.py   # tools/fixture-setup.py: edits config/sidebar and writes the new docs
printf '%s\n' '---' 'title: Home' '---' '' '# Example Docs' '' 'Welcome to the Example Docs home page. Head over to the [documentation](/docs/intro) to get started.' > src/pages/index.md
npm install --no-audit --no-fund          # npm ci not possible: package.json changed
npm install --no-audit --no-fund @docusaurus/theme-mermaid@3.9.2
npx docusaurus build
python3 /tmp/fixture-copy.py build /tmp/extract-fixture/site handmade   # tools/fixture-copy.py
```

Changes to the example clone (made by `fixture-setup.py`):

- Removed the `docusaurus-plugin-mcp-server` entry from `plugins` in `docusaurus.config.js` and from `package.json` dependencies (it pointed at `file:../..`).
- Removed the `custom-mcpInstall` navbar item and deleted `src/theme/NavbarItem/`. That swizzle imports `docusaurus-plugin-mcp-server/theme`.
- Replaced `new Date().getFullYear()` in the footer with a fixed `2025`, for determinism.
- Added `markdown: { mermaid: true }` and `themes: ['@docusaurus/theme-mermaid']`.
- Added `docs/rich.mdx`, `docs/tiny.md`, `docs/nested/deep.md` (plus sidebar entries) and `src/pages/index.md`. The original example had no home page.

## Determinism

- The site was rebuilt from scratch (`rm -rf build .docusaurus`), then stripped again. `diff -r` against the first run was empty, so the output is byte-identical across builds.
- There are no hashed asset URLs (they were all in the stripped `<script>`/`<link>` tags), no timestamps, no last-updated dates, and no local filesystem paths.
- Remaining version-coupled tokens: CSS-module class names such as `anchorTargetStickyNavbar_Vzrq` (49 distinct), plus `<meta name="generator" content="Docusaurus v3.9.2">`. They are stable for a given Docusaurus version and theme, but will change if the fixture is rebuilt with a different version.
- The literal dates and numbers in `docs/api/endpoints/index.html` (`2024-01-15T10:30:00Z`, `1704067200`) come from the source markdown. They are not build artifacts.
- The footer contains the fixed text "Copyright © 2025 Example."

## Notes

- Mermaid renders client-side only, so the static HTML has nothing under the `#diagram` h2 except `<!-- -->`. The mermaid source does not appear in the fixture.
- Tabs: both TabItem panels appear in the HTML. The non-default panel carries the `hidden` attribute.
- The example has no blog, so there are no blog index or blog post pages.
- The `&nbsp;` is serialized by React as a raw U+00A0 character, not as an entity. `&amp;` and `&lt;` stay as entities.
- `style="..."` attributes are kept, for example Prism token colors in code blocks. Only `<style>` elements were removed.
