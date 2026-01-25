---
sidebar_position: 1
---

# Authentication

All API requests require authentication using an API key.

## API Keys

API keys are used to authenticate requests to our API. You can manage your API keys in the [dashboard](https://dashboard.example.com).

### Creating an API Key

1. Log in to your dashboard
2. Navigate to **Settings** > **API Keys**
3. Click **Create New Key**
4. Give your key a descriptive name
5. Copy and securely store the key (it won't be shown again)

### Key Types

| Type | Description | Use Case |
|------|-------------|----------|
| **Test** | For development and testing | Sandbox environment |
| **Live** | For production use | Production environment |

## Using API Keys

Include your API key in the `Authorization` header:

```bash
curl https://api.example.com/v1/users \
  -H "Authorization: Bearer YOUR_API_KEY"
```

Or using the SDK:

```javascript
const client = new Client({
  apiKey: 'your-api-key',
});
```

## OAuth Configuration {#oauth-configuration}

For applications that need to act on behalf of users, we support OAuth 2.0.

### OAuth Flow

1. Redirect user to authorization URL
2. User grants permission
3. Receive authorization code
4. Exchange code for access token
5. Use access token for API requests

### Implementation

```javascript
import { OAuth } from '@example/sdk';

const oauth = new OAuth({
  clientId: 'your-client-id',
  clientSecret: 'your-client-secret',
  redirectUri: 'https://yourapp.com/callback',
});

// Generate authorization URL
const authUrl = oauth.getAuthorizationUrl({
  scopes: ['read', 'write'],
  state: 'random-state-string',
});

// Exchange code for token
const tokens = await oauth.exchangeCode(authorizationCode);
```

### Scopes

| Scope | Description |
|-------|-------------|
| `read` | Read-only access to resources |
| `write` | Create and modify resources |
| `delete` | Delete resources |
| `admin` | Full administrative access |

## Token Refresh

Access tokens expire after 1 hour. Use the refresh token to get a new access token:

```javascript
const newTokens = await oauth.refreshToken(refreshToken);
```

## Security Best Practices

- Never expose API keys in client-side code
- Use environment variables for key storage
- Rotate keys periodically
- Use the minimum required scopes
- Monitor API key usage in your dashboard
