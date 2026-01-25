import React from 'react';
import { McpInstallButton } from 'docusaurus-plugin-mcp-server/theme';

export default function McpInstallNavbarItem() {
  return (
    <McpInstallButton
      serverUrl="https://example.com/mcp"
      serverName="example-docs"
    />
  );
}
