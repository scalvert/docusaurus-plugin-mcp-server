# Installation

> This guide will walk you through installing our SDK in your project.

## Contents

  - [Installing the SDK](#installing-the-sdk)
  - [Environment Variables](#environment-variables)
  - [Verifying Installation](#verifying-installation)
  - [Troubleshooting](#troubleshooting)
    - [Error [ERR_MODULE_NOT_FOUND]: Cannot find package '@example/sdk'](#error-err_module_not_found-cannot-find-package-examplesdk)
  - [Next Steps](#next-steps)

---

This guide will walk you through installing our SDK in your project.

**Done when:**

`node -e "import('@example/sdk').then((m) => console.log(new m.Client({ apiKey: process.env.EXAMPLE_API_KEY }).version))"` prints a version number.

- Node.js 18 or higher. Check: `node --version`.
- A project with a `package.json`. Check: `ls package.json`.

## Installing the SDK

Install the package using npm:

```bash
npm install @example/sdk
```

**Check:**

`npm ls @example/sdk` lists the package.

## Environment Variables

We recommend storing your API key in an environment variable:

```bash
export EXAMPLE_API_KEY=your-api-key
```

The user creates the key and sets the variable themselves. Never ask them to paste the key into the chat. If they only want to try the SDK, tell them to create a test key: live keys reach production data.

**Check:**

`node -e "console.log(Boolean(process.env.EXAMPLE_API_KEY))"` prints `true`.

## Verifying Installation

After installation, verify it works by importing the SDK:

```javascript
import { Client } from '@example/sdk';

const client = new Client({
  apiKey: process.env.EXAMPLE_API_KEY,
});

console.log('SDK version:', client.version);
```

**Check:**

The script prints `SDK version:` and a version number.

## Troubleshooting

### `Error [ERR_MODULE_NOT_FOUND]: Cannot find package '@example/sdk'`

**Cause:** The SDK isn't installed in the folder you ran the script from, often because it went into a different workspace package.

**Fix:** Run `npm install @example/sdk` in the folder that has the script's `package.json`, then run the script again.

**Check:**

`npm ls @example/sdk` lists the package.

**Escalate if:** the package is listed but the error stays.

## Next Steps

Now that you have the SDK installed, proceed to [Configuration](/docs/getting-started/configuration) to set up your client.

