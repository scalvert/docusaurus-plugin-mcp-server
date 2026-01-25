#!/usr/bin/env node
/**
 * Test MCP Server for Playwright integration tests
 *
 * This script starts an MCP server with sample documentation data
 * for integration testing with @gleanwork/mcp-server-tester.
 */

import http from 'http';
import { McpDocsServer } from '../dist/index.mjs';
import { buildSearchIndex, exportSearchIndex } from '../dist/index.mjs';

const PORT = process.env.PORT || 3457;

// Sample documentation for testing
const sampleDocsArray = [
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
\`\`\``,
    headings: [
      { level: 1, text: 'Installation', id: 'installation', startOffset: 0, endOffset: 80 },
      { level: 2, text: 'Prerequisites', id: 'prerequisites', startOffset: 81, endOffset: 200 },
      { level: 2, text: 'Installing via npm', id: 'installing-via-npm', startOffset: 201, endOffset: 300 },
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

Access tokens are used to authenticate API requests.`,
    headings: [
      { level: 1, text: 'Authentication', id: 'authentication', startOffset: 0, endOffset: 100 },
      { level: 2, text: 'OAuth 2.0', id: 'oauth-20', startOffset: 101, endOffset: 200 },
      { level: 3, text: 'Access Tokens', id: 'access-tokens', startOffset: 201, endOffset: 300 },
    ],
  },
];

// Convert to Record for lookups
const sampleDocs = {};
for (const doc of sampleDocsArray) {
  sampleDocs[doc.route] = doc;
}

async function main() {
  // Build search index
  const searchIndex = buildSearchIndex(sampleDocsArray);
  const searchIndexData = await exportSearchIndex(searchIndex);

  const mcpServer = new McpDocsServer({
    name: 'test-docs',
    version: '1.0.0',
    docs: sampleDocs,
    searchIndexData,
    baseUrl: 'https://docs.example.com',
  });

  await mcpServer.initialize();

  const httpServer = http.createServer(async (req, res) => {
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    if (req.method === 'GET') {
      const status = await mcpServer.getStatus();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(status));
      return;
    }

    if (req.method === 'POST') {
      try {
        let body = '';
        for await (const chunk of req) {
          body += chunk;
        }
        const parsedBody = JSON.parse(body);
        await mcpServer.handleHttpRequest(req, res, parsedBody);
      } catch (error) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            jsonrpc: '2.0',
            id: null,
            error: { code: -32603, message: error.message },
          })
        );
      }
      return;
    }

    res.writeHead(405);
    res.end();
  });

  httpServer.listen(PORT, () => {
    console.log(`Test MCP server running on http://localhost:${PORT}`);
  });
}

main().catch(console.error);
