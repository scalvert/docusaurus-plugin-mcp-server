# Troubleshooting: Connect an MCP host to Glean

## `401 invalid_token` when the host connects {#invalid-token}

**Cause:** The host is sending a token from a different Glean instance.

**Fix:** Remove the server from the host, add it again with the URL from the Configurator, and sign in when the host asks.

**Check:** `claude mcp list` shows `glean` as connected.

**Escalate if:** the error persists after signing in again. The company's SSO settings may block the host.

Source: https://developers.glean.com/guides/mcp/troubleshooting#invalid-token
