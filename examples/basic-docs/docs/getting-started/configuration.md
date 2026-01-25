---
sidebar_position: 2
---

# Configuration

Learn how to configure the SDK for your use case.

## Basic Configuration

The simplest configuration requires only an API key:

```javascript
import { Client } from '@example/sdk';

const client = new Client({
  apiKey: 'your-api-key',
});
```

## Advanced Options

For more control, you can specify additional options:

```javascript
const client = new Client({
  apiKey: 'your-api-key',
  baseUrl: 'https://api.example.com/v2',
  timeout: 30000, // 30 seconds
  retries: 3,
  debug: true,
});
```

### Option Reference

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `apiKey` | `string` | required | Your API key |
| `baseUrl` | `string` | `https://api.example.com/v1` | API base URL |
| `timeout` | `number` | `10000` | Request timeout in ms |
| `retries` | `number` | `2` | Number of retry attempts |
| `debug` | `boolean` | `false` | Enable debug logging |

## Environment-Specific Configuration

### Development

```javascript
const client = new Client({
  apiKey: process.env.EXAMPLE_API_KEY,
  baseUrl: 'https://sandbox.example.com/v1',
  debug: true,
});
```

### Production

```javascript
const client = new Client({
  apiKey: process.env.EXAMPLE_API_KEY,
  timeout: 5000,
  retries: 5,
});
```

## Logging

Enable detailed logging by setting `debug: true`:

```javascript
const client = new Client({
  apiKey: 'your-api-key',
  debug: true,
});
```

This will log all requests and responses to the console.

## Next Steps

With configuration complete, check out the [API Reference](/docs/api/authentication) to start making requests.
