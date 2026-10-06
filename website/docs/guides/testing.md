---
title: Testing the endpoint
description: Check the build output, then call the endpoint with the MCP Inspector or curl.
---

# Testing the endpoint

Test in this order: the build output first, then the running endpoint, locally or deployed.

## Verify the build

```bash
npx docusaurus-mcp-verify
```

This reads and validates `build/mcp/bundle.json`, checks that it has a search index for the built-in search, and starts a server from it. See [`docusaurus-mcp-verify`](../reference/cli.md) for options.

## MCP Inspector

The [MCP Inspector](https://github.com/modelcontextprotocol/inspector) is a browser UI for calling a server's tools by hand:

```bash
npx @modelcontextprotocol/inspector
```

Choose **Streamable HTTP** as the transport, enter your endpoint URL (`http://localhost:3456` for the [local server](../getting-started.md#4-run-the-server-locally), or your deployed `/mcp` URL), and connect. From there you can list the tools, run `docs_search` and `docs_fetch`, and browse the skill resources.

## curl

A `GET` returns the server status:

```bash
curl https://docs.example.com/mcp
```

MCP requests are `POST`s with a JSON-RPC body. The `Accept` header must list both `application/json` and `text/event-stream`:

```bash
# List the tools
curl -X POST https://docs.example.com/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'

# Search the docs
curl -X POST https://docs.example.com/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{
    "jsonrpc": "2.0",
    "id": 2,
    "method": "tools/call",
    "params": {
      "name": "docs_search",
      "arguments": { "query": "getting started" }
    }
  }'

# Fetch a page, using a URL from the search results
curl -X POST https://docs.example.com/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{
    "jsonrpc": "2.0",
    "id": 3,
    "method": "tools/call",
    "params": {
      "name": "docs_fetch",
      "arguments": { "url": "https://docs.example.com/docs/intro" }
    }
  }'
```

The server is stateless, so you don't need an `initialize` call or a session ID first.

## In CI

Add `docusaurus-mcp-verify` after your build so a broken bundle fails the pipeline before it's deployed:

```json title="package.json"
{
  "scripts": {
    "build": "docusaurus build",
    "postbuild": "docusaurus-mcp-verify"
  }
}
```

To guard search quality as well, see [Measuring search quality](./search.md#measuring-search-quality).
