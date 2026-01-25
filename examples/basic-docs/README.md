# Basic Docs Example

A minimal Docusaurus site demonstrating the `docusaurus-plugin-mcp-server` plugin.

## Quick Start

```bash
# Install dependencies
npm install

# Build the site (generates MCP artifacts)
npm run build

# Start the local MCP server
npm run mcp:serve
```

## Connect AI Tools

### Claude Code

```bash
claude mcp add --transport http example-docs http://localhost:3456
```

### Cursor / VS Code

Add to your MCP settings:

```json
{
  "mcpServers": {
    "example-docs": {
      "url": "http://localhost:3456"
    }
  }
}
```

## Test the Server

```bash
# Health check
curl http://localhost:3456

# List available tools
curl -X POST http://localhost:3456 \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'

# Search documentation
curl -X POST http://localhost:3456 \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc":"2.0",
    "id":2,
    "method":"tools/call",
    "params":{
      "name":"docs_search",
      "arguments":{"query":"authentication"}
    }
  }'
```

## Project Structure

```
basic-docs/
├── docs/                    # Documentation source files
│   ├── intro.md
│   ├── getting-started/
│   │   ├── installation.md
│   │   └── configuration.md
│   └── api/
│       ├── authentication.md
│       └── endpoints.md
├── build/                   # Generated after npm run build
│   └── mcp/                 # MCP artifacts
│       ├── docs.json        # Processed documentation
│       ├── search-index.json
│       └── manifest.json
├── docusaurus.config.js     # Docusaurus + plugin config
├── mcp-server.mjs           # Local development server
└── package.json
```

## Configuration

The plugin is configured in `docusaurus.config.js`:

```javascript
plugins: [
  [
    'docusaurus-plugin-mcp-server',
    {
      server: {
        name: 'example-docs',
        version: '1.0.0',
      },
    },
  ],
],
```

## Deploying to Production

See the main package README for deployment guides for:
- Vercel
- Netlify
- Cloudflare Workers
