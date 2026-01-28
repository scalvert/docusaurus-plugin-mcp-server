import React from 'react';
import { McpInstallButton } from 'docusaurus-plugin-mcp-server/theme';

export default function McpInstallNavbarItem() {
  // Icon-only mode (no label) with custom header text
  return (
    <McpInstallButton
      serverUrl="https://example.com/mcp"
      serverName="example-docs"
      headerText="Install in your AI tool:"
    />
  );
}
