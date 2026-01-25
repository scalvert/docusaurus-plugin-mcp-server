---
sidebar_position: 1
---

# Introduction

Welcome to our Example Documentation! This site demonstrates how to use the `docusaurus-plugin-mcp-server` to expose your documentation to AI agents.

## What is MCP?

The Model Context Protocol (MCP) is an open standard that allows AI assistants to connect to external data sources. This plugin creates an MCP server from your Docusaurus documentation, allowing AI tools like Claude and Cursor to search and read your docs.

## Features

- **Full-text search** - AI agents can search across all your documentation
- **Page retrieval** - Get complete page content as clean markdown
- **Section extraction** - Extract specific sections by heading ID
- **Build-time processing** - All indexing happens during build, making runtime fast

## Quick Example

Once configured, AI agents can query your documentation like this:

```
Search for "authentication" in the docs
Get the page at /docs/api/authentication
Get the "oauth-configuration" section from the authentication page
```

## Next Steps

Head to [Installation](/docs/getting-started/installation) to get started!
