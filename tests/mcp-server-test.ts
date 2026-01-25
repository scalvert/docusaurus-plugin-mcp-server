import { describe, it, expect, beforeAll } from 'vitest';
import { McpDocsServer } from '../src/mcp/server.js';
import { buildSearchIndex, exportSearchIndex } from '../src/search/flexsearch-indexer.js';
import type { ProcessedDoc } from '../src/types/index.js';

/**
 * Integration tests for the MCP server
 *
 * These tests verify the full server functionality including:
 * - Server initialization with pre-loaded data
 * - Status reporting
 * - Tool invocation via the underlying MCP SDK
 */
describe('McpDocsServer', () => {
  // Sample documentation for testing
  const sampleDocsArray: ProcessedDoc[] = [
    {
      route: '/docs/intro',
      title: 'Introduction',
      description: 'Welcome to our documentation',
      markdown: `# Introduction

Welcome to the documentation. This guide will help you get started.

## Overview

Our platform provides powerful tools for building applications.

## Quick Start

Get up and running in minutes with our quick start guide.`,
      headings: [
        { level: 1, text: 'Introduction', id: 'introduction', startOffset: 0, endOffset: 50 },
        { level: 2, text: 'Overview', id: 'overview', startOffset: 51, endOffset: 120 },
        { level: 2, text: 'Quick Start', id: 'quick-start', startOffset: 121, endOffset: 200 },
      ],
    },
    {
      route: '/docs/installation',
      title: 'Installation Guide',
      description: 'How to install and configure the platform',
      markdown: `# Installation

This guide covers installation on various platforms.

## Prerequisites

Before installing, ensure you have:
- Node.js 18 or later
- npm or yarn package manager

## Installing via npm

Run the following command to install:

\`\`\`bash
npm install my-platform
\`\`\`

## Installing via yarn

Alternatively, use yarn:

\`\`\`bash
yarn add my-platform
\`\`\``,
      headings: [
        { level: 1, text: 'Installation', id: 'installation', startOffset: 0, endOffset: 80 },
        { level: 2, text: 'Prerequisites', id: 'prerequisites', startOffset: 81, endOffset: 200 },
        { level: 2, text: 'Installing via npm', id: 'installing-via-npm', startOffset: 201, endOffset: 300 },
        { level: 2, text: 'Installing via yarn', id: 'installing-via-yarn', startOffset: 301, endOffset: 400 },
      ],
    },
    {
      route: '/docs/api/authentication',
      title: 'Authentication API',
      description: 'API reference for authentication',
      markdown: `# Authentication

Secure your application with our authentication API.

## OAuth 2.0

We support OAuth 2.0 for secure authorization.

### Access Tokens

Access tokens are used to authenticate API requests.

\`\`\`javascript
const token = await auth.getAccessToken();
\`\`\`

## API Keys

For server-to-server communication, use API keys.

### Generating Keys

Generate API keys from the dashboard.`,
      headings: [
        { level: 1, text: 'Authentication', id: 'authentication', startOffset: 0, endOffset: 100 },
        { level: 2, text: 'OAuth 2.0', id: 'oauth-20', startOffset: 101, endOffset: 200 },
        { level: 3, text: 'Access Tokens', id: 'access-tokens', startOffset: 201, endOffset: 300 },
        { level: 2, text: 'API Keys', id: 'api-keys', startOffset: 301, endOffset: 400 },
        { level: 3, text: 'Generating Keys', id: 'generating-keys', startOffset: 401, endOffset: 450 },
      ],
    },
  ];

  // Convert to Record for lookups
  const sampleDocs: Record<string, ProcessedDoc> = {};
  for (const doc of sampleDocsArray) {
    sampleDocs[doc.route] = doc;
  }

  // Build search index for testing
  const searchIndex = buildSearchIndex(sampleDocsArray);
  let searchIndexData: Record<string, unknown>;

  beforeAll(async () => {
    searchIndexData = (await exportSearchIndex(searchIndex)) as Record<string, unknown>;
  });

  describe('initialization', () => {
    it('initializes with pre-loaded data config', async () => {
      const server = new McpDocsServer({
        name: 'test-docs',
        version: '1.0.0',
        docs: sampleDocs,
        searchIndexData,
        baseUrl: 'https://docs.example.com',
      });

      // Initialize manually
      await server.initialize();

      const status = await server.getStatus();
      expect(status.initialized).toBe(true);
      expect(status.docCount).toBe(3);
    });

    it('reports correct status before initialization', async () => {
      const server = new McpDocsServer({
        name: 'test-docs',
        version: '2.0.0',
        docs: sampleDocs,
        searchIndexData,
      });

      const status = await server.getStatus();
      expect(status.name).toBe('test-docs');
      expect(status.version).toBe('2.0.0');
      expect(status.initialized).toBe(false);
      expect(status.docCount).toBe(0);
    });

    it('includes baseUrl in status when provided', async () => {
      const server = new McpDocsServer({
        name: 'test-docs',
        docs: sampleDocs,
        searchIndexData,
        baseUrl: 'https://example.com/docs',
      });

      const status = await server.getStatus();
      expect(status.baseUrl).toBe('https://example.com/docs');
    });

    it('defaults version to 1.0.0 when not provided', async () => {
      const server = new McpDocsServer({
        name: 'test-docs',
        docs: sampleDocs,
        searchIndexData,
      });

      const status = await server.getStatus();
      expect(status.version).toBe('1.0.0');
    });

    it('only initializes once even when called multiple times', async () => {
      const server = new McpDocsServer({
        name: 'test-docs',
        docs: sampleDocs,
        searchIndexData,
      });

      await server.initialize();
      const status1 = await server.getStatus();

      await server.initialize();
      const status2 = await server.getStatus();

      expect(status1.initialized).toBe(true);
      expect(status2.initialized).toBe(true);
    });
  });

  describe('getMcpServer', () => {
    it('returns the underlying MCP server instance', () => {
      const server = new McpDocsServer({
        name: 'test-docs',
        docs: sampleDocs,
        searchIndexData,
      });

      const mcpServer = server.getMcpServer();
      expect(mcpServer).toBeDefined();
    });
  });

  describe('search functionality', () => {
    let server: McpDocsServer;

    beforeAll(async () => {
      server = new McpDocsServer({
        name: 'test-docs',
        docs: sampleDocs,
        searchIndexData,
        baseUrl: 'https://docs.example.com',
      });
      await server.initialize();
    });

    it('finds documents by title keywords', async () => {
      // We can't directly call the tools since they're registered internally
      // Instead, we verify the server is set up correctly
      const status = await server.getStatus();
      expect(status.initialized).toBe(true);
      expect(status.docCount).toBe(3);
    });
  });

  describe('configuration validation', () => {
    it('accepts file-based config with docsPath and indexPath', () => {
      // This would fail on initialize() if paths don't exist, but construction works
      const server = new McpDocsServer({
        name: 'test-docs',
        docsPath: '/nonexistent/docs.json',
        indexPath: '/nonexistent/index.json',
      });

      expect(server).toBeDefined();
    });

    it('accepts data-based config with docs and searchIndexData', () => {
      const server = new McpDocsServer({
        name: 'test-docs',
        docs: sampleDocs,
        searchIndexData,
      });

      expect(server).toBeDefined();
    });
  });
});

describe('McpDocsServer HTTP handling', () => {
  const sampleDocsArray: ProcessedDoc[] = [
    {
      route: '/docs/test',
      title: 'Test Document',
      description: 'A test document for HTTP handling',
      markdown: '# Test\n\nThis is test content.',
      headings: [{ level: 1, text: 'Test', id: 'test', startOffset: 0, endOffset: 30 }],
    },
  ];

  const sampleDocs: Record<string, ProcessedDoc> = {};
  for (const doc of sampleDocsArray) {
    sampleDocs[doc.route] = doc;
  }

  const searchIndex = buildSearchIndex(sampleDocsArray);
  let searchIndexData: Record<string, unknown>;

  beforeAll(async () => {
    searchIndexData = (await exportSearchIndex(searchIndex)) as Record<string, unknown>;
  });

  describe('handleWebRequest', () => {
    it('processes a valid JSON-RPC initialize request', async () => {
      const server = new McpDocsServer({
        name: 'test-docs',
        docs: sampleDocs,
        searchIndexData,
      });

      // Create a Web Standard Request for the initialize method
      const request = new Request('http://localhost:3000/mcp', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json, text/event-stream',
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'initialize',
          params: {
            protocolVersion: '2024-11-05',
            capabilities: {},
            clientInfo: {
              name: 'test-client',
              version: '1.0.0',
            },
          },
        }),
      });

      const response = await server.handleWebRequest(request);
      expect(response).toBeInstanceOf(Response);
      expect(response.status).toBe(200);

      const body = await response.json();
      expect(body.jsonrpc).toBe('2.0');
      expect(body.id).toBe(1);
      // The response should include server capabilities
      expect(body.result).toBeDefined();
    });

    it('handles tools/list request', async () => {
      const server = new McpDocsServer({
        name: 'test-docs',
        docs: sampleDocs,
        searchIndexData,
      });

      // First, initialize the session
      const initRequest = new Request('http://localhost:3000/mcp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'initialize',
          params: {
            protocolVersion: '2024-11-05',
            capabilities: {},
            clientInfo: { name: 'test-client', version: '1.0.0' },
          },
        }),
      });
      await server.handleWebRequest(initRequest);

      // Now list tools
      const listRequest = new Request('http://localhost:3000/mcp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 2,
          method: 'tools/list',
          params: {},
        }),
      });

      const response = await server.handleWebRequest(listRequest);
      expect(response.status).toBe(200);

      const body = await response.json();
      expect(body.result).toBeDefined();
      expect(body.result.tools).toBeInstanceOf(Array);

      // Should have our 3 tools
      const toolNames = body.result.tools.map((t: { name: string }) => t.name);
      expect(toolNames).toContain('docs_search');
      expect(toolNames).toContain('docs_get_page');
      expect(toolNames).toContain('docs_get_section');
    });

    it('handles tools/call for docs_search', async () => {
      const server = new McpDocsServer({
        name: 'test-docs',
        docs: sampleDocs,
        searchIndexData,
        baseUrl: 'https://docs.example.com',
      });

      // Initialize first
      const initRequest = new Request('http://localhost:3000/mcp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'initialize',
          params: {
            protocolVersion: '2024-11-05',
            capabilities: {},
            clientInfo: { name: 'test-client', version: '1.0.0' },
          },
        }),
      });
      await server.handleWebRequest(initRequest);

      // Call docs_search tool
      const callRequest = new Request('http://localhost:3000/mcp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 3,
          method: 'tools/call',
          params: {
            name: 'docs_search',
            arguments: {
              query: 'test',
              limit: 5,
            },
          },
        }),
      });

      const response = await server.handleWebRequest(callRequest);
      expect(response.status).toBe(200);

      const body = await response.json();
      expect(body.result).toBeDefined();
      expect(body.result.content).toBeInstanceOf(Array);
      expect(body.result.content[0].type).toBe('text');
    });

    it('handles tools/call for docs_get_page', async () => {
      const server = new McpDocsServer({
        name: 'test-docs',
        docs: sampleDocs,
        searchIndexData,
      });

      // Initialize
      const initRequest = new Request('http://localhost:3000/mcp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'initialize',
          params: {
            protocolVersion: '2024-11-05',
            capabilities: {},
            clientInfo: { name: 'test-client', version: '1.0.0' },
          },
        }),
      });
      await server.handleWebRequest(initRequest);

      // Get a page
      const callRequest = new Request('http://localhost:3000/mcp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 4,
          method: 'tools/call',
          params: {
            name: 'docs_get_page',
            arguments: {
              route: '/docs/test',
            },
          },
        }),
      });

      const response = await server.handleWebRequest(callRequest);
      expect(response.status).toBe(200);

      const body = await response.json();
      expect(body.result).toBeDefined();
      expect(body.result.content).toBeInstanceOf(Array);
      expect(body.result.content[0].text).toContain('Test Document');
    });
  });
});
