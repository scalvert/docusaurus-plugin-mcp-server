---
name: setup-example-sdk
description: Install the Example SDK in a Node.js project and connect it with an API key. Use when the user wants to install, set up, or start using the Example SDK.
metadata:
  agent-guide: setup
  agent-guide-format: "1"
  source: https://example.com/docs/getting-started/installation
---

# Installation

## Done when

`node -e "import('@example/sdk').then((m) => console.log(new m.Client({ apiKey: process.env.EXAMPLE_API_KEY }).version))"` prints a version number.

## Before you start

- Node.js 18 or higher. Check: `node --version`.
- A project with a `package.json`. Check: `ls package.json`.

## How to use this guide

- Do the steps in order. Run them yourself, or walk the user through them one at a time if they'd rather do it themselves or you can't run them.
- After each step, run its check. Don't move on until it passes.
- If a check fails, look for the matching symptom under Troubleshooting. If none matches, stop and tell the user what you saw.
- A step marked **Needs the user** needs a person. Tell the user what to do and wait for them to confirm it's done.
- Ask the user before running a step marked **Confirm first**.
- Don't ask the user to paste passwords, tokens, or keys into the chat. When a step needs one, tell the user where to put it.

## Steps

### 1. Installing the SDK {#install}

Install the package using npm:

```bash
npm install @example/sdk
```

**Check:** `npm ls @example/sdk` lists the package.

**If the check fails:** see [`Error [ERR_MODULE_NOT_FOUND]: Cannot find package '@example/sdk'`](references/troubleshooting.md#module-not-found).

### 2. Environment Variables {#api-key}

**Needs the user.**

We recommend storing your API key in an environment variable:

```bash
export EXAMPLE_API_KEY=your-api-key
```

The user creates the key and sets the variable themselves. Never ask them to paste the key into the chat. If they only want to try the SDK, tell them to create a test key: live keys reach production data.

**Check:** `node -e "console.log(Boolean(process.env.EXAMPLE_API_KEY))"` prints `true`.

**If the check fails:** see [Troubleshooting](references/troubleshooting.md).

### 3. Verifying Installation {#verify}

After installation, verify it works by importing the SDK:

```javascript
import { Client } from '@example/sdk';

const client = new Client({
  apiKey: process.env.EXAMPLE_API_KEY,
});

console.log('SDK version:', client.version);
```

**Check:** The script prints `SDK version:` and a version number.

**If the check fails:** see [`Error [ERR_MODULE_NOT_FOUND]: Cannot find package '@example/sdk'`](references/troubleshooting.md#module-not-found).

## Troubleshooting

- [`Error [ERR_MODULE_NOT_FOUND]: Cannot find package '@example/sdk'`](references/troubleshooting.md#module-not-found)

## Source

Generated from https://example.com/docs/getting-started/installation. If a step doesn't match what the user sees, tell them, and point them to that page.

