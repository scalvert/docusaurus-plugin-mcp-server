---
sidebar_position: 1
---

# Installation

This guide will walk you through installing our SDK in your project.

## Prerequisites

Before you begin, make sure you have:

- Node.js 18 or higher
- npm or yarn package manager
- A basic understanding of JavaScript/TypeScript

## Installing the SDK

Install the package using npm:

```bash
npm install @example/sdk
```

Or using yarn:

```bash
yarn add @example/sdk
```

## Verifying Installation

After installation, verify it works by importing the SDK:

```javascript
import { Client } from '@example/sdk';

const client = new Client({
  apiKey: 'your-api-key',
});

console.log('SDK version:', client.version);
```

## Environment Variables

We recommend storing your API key in an environment variable:

```bash
export EXAMPLE_API_KEY=your-api-key
```

Then access it in your code:

```javascript
const client = new Client({
  apiKey: process.env.EXAMPLE_API_KEY,
});
```

## Next Steps

Now that you have the SDK installed, proceed to [Configuration](/docs/getting-started/configuration) to set up your client.
