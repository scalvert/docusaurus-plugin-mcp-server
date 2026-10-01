# Usage: python3 fixture-setup.py <path to a copy of examples/basic-docs>
# Edits that copy so it builds without this plugin and gains the fixture pages.
import json, os, re, shutil, sys

root = sys.argv[1]
os.chdir(root)

# --- config: drop MCP plugin, custom navbar item, dynamic year; enable mermaid
cfg = open('docusaurus.config.js').read()
cfg = re.sub(r"\n  plugins: \[\n.*?\n  \],\n", "\n", cfg, flags=re.S)
cfg = re.sub(r"\n          \{\n            type: 'custom-mcpInstall',\n            position: 'right',\n          \},", "", cfg)
cfg = cfg.replace("`Copyright © ${new Date().getFullYear()} Example. Built with Docusaurus.`",
                  "'Copyright © 2025 Example. Built with Docusaurus.'")
cfg = cfg.replace("  i18n: {", "  markdown: {\n    mermaid: true,\n  },\n  themes: ['@docusaurus/theme-mermaid'],\n\n  i18n: {")
assert 'docusaurus-plugin-mcp-server' not in cfg and 'custom-mcpInstall' not in cfg and 'getFullYear' not in cfg
open('docusaurus.config.js', 'w').write(cfg)

# swizzled navbar item imports the plugin's theme; remove it
shutil.rmtree('src/theme')

pkg = json.load(open('package.json'))
del pkg['dependencies']['docusaurus-plugin-mcp-server']
json.dump(pkg, open('package.json', 'w'), indent=2)

# --- sidebar
sb = open('sidebars.js').read()
sb = sb.replace("      items: ['api/authentication', 'api/endpoints'],\n    },\n",
                "      items: ['api/authentication', 'api/endpoints'],\n    },\n    'rich',\n    'tiny',\n    'nested/deep',\n")
assert "'rich'" in sb
open('sidebars.js', 'w').write(sb)

# --- new docs
rich = r'''---
title: Rich Content
description: A page exercising many Docusaurus rendering features.
sidebar_position: 10
---

import Tabs from '@theme/Tabs';
import TabItem from '@theme/TabItem';

# Rich Content

This page exercises **bold text**, *italic text*, ***bold italic***, and `inline code` so the extractor can be tested against real Docusaurus output. See the [installation guide](./getting-started/installation.md) or the [Docusaurus website](https://docusaurus.io/docs).

![Example diagram alt text](https://example.com/images/diagram.png)

## Setup

First setup section. Install the dependencies before continuing.

### Prerequisites

You need Node.js 18 or newer.

#### Optional tools

A text editor with MDX support is helpful.

## Setup

Second setup section with the same heading text, so Docusaurus assigns a `-1` suffix to its id.

## Custom {#my-custom-id}

This heading uses an explicit custom id.

## Admonitions

:::note

This is a note admonition with the default title.

:::

:::tip

This is a tip with a `code` reference inside.

:::

:::warning[Careful Now]

This warning has a custom title.

:::

## Tabs

<Tabs>
  <TabItem value="npm" label="npm" default>

```bash
npm install example-package
```

  </TabItem>
  <TabItem value="yarn" label="Yarn">

```bash
yarn add example-package
```

  </TabItem>
</Tabs>

## Details

<details>
  <summary>Click to expand</summary>

Hidden content inside a details block, with a [link](/docs/intro).

</details>

## Table

| Option    | Type      | Default | Description             |
| --------- | --------- | ------- | ----------------------- |
| `name`    | `string`  | `"x"`   | The server name.        |
| `enabled` | `boolean` | `true`  | Whether it is **on**.   |
| `limit`   | `number`  | `10`    | Max results per query.  |

## Task list

- [x] Write the docs
- [ ] Review the docs
- [ ] Publish the docs

## Footnotes

This sentence has a footnote.[^1]

[^1]: This is the footnote text.

## Code blocks

```bash title="install.sh"
# Install it
## not a heading
npm install example-package
```

```js
const greeting = 'hello';
console.log(greeting);
```

## Diagram

```mermaid
graph TD;
  A[Start] --> B[Finish];
```

## Entities and breaks

Tom &amp; Jerry use 1 &lt; 2 comparisons&nbsp;with a non-breaking space.<br/>This text follows a line break.

> This is a blockquote with **emphasis** inside.
>
> It spans two paragraphs.
'''
open('docs/rich.mdx', 'w').write(rich)

open('docs/tiny.md', 'w').write('''---
sidebar_position: 11
---

# Tiny

Short page.
''')

os.makedirs('docs/nested', exist_ok=True)
open('docs/nested/deep.md', 'w').write('''---
sidebar_position: 12
---

# Deeply Nested Page

This page lives in a nested directory so that its route is `/docs/nested/deep`. It exists to verify that the extractor handles nested build output paths correctly.

## Nested section

Content in a nested section with a list:

- First item
- Second item
- Third item
''')
print('ok')
