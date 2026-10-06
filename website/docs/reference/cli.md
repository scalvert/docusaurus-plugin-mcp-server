---
title: docusaurus-mcp-verify
description: The CLI that checks a build's artifact bundle and starts a server from it.
---

# `docusaurus-mcp-verify`

Checks the MCP output of a Docusaurus build. It installs with the plugin.

```bash
npx docusaurus-mcp-verify [buildDir] [--output-dir <dir>]
```

| Argument | Default | Description |
| --- | --- | --- |
| `buildDir` | `./build` | The Docusaurus build output directory |
| `--output-dir <dir>` | `mcp` | The artifact directory inside `buildDir`. Match the plugin's `outputDir` option if you changed it |
| `-h`, `--help` | | Show usage |

It checks that:

- the artifact bundle reads and validates (`bundle.json`, or the per-file layout from 2.0/2.1 builds, with a warning)
- it has a search index for the built-in local search
- an MCP server can initialize and load the content

```bash
npx docusaurus-mcp-verify
npx docusaurus-mcp-verify ./custom-build
npx docusaurus-mcp-verify ./custom-build --output-dir agents/mcp
```

Example output:

```text
🔍 MCP Build Verification
==================================================
Build directory: /path/to/your/project/build
MCP directory:   /path/to/your/project/build/mcp

📁 Checking build output...
   ✓ Found 42 documents
   ✓ Artifact bundle is valid

🚀 Testing MCP server...
   ✓ Server "my-docs" initialized with 42 documents

✅ All checks passed!
```

## Exit codes

| Code | Meaning |
| --- | --- |
| `0` | All checks passed |
| `1` | The bundle failed validation or the server failed to start |
| `2` | Invalid arguments |

Run it as a `postbuild` script to fail the build when the bundle is broken:

```json title="package.json"
{
  "scripts": {
    "build": "docusaurus build",
    "postbuild": "docusaurus-mcp-verify"
  }
}
```
