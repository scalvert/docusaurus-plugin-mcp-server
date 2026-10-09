// @ts-check

/** @type {import('@docusaurus/plugin-content-docs').SidebarsConfig} */
const sidebars = {
  docs: [
    'intro',
    'getting-started',
    {
      type: 'category',
      label: 'Guides',
      collapsed: false,
      items: [
        'guides/connect-clients',
        'guides/install-button',
        'guides/testing',
        'guides/agent-skills',
        'guides/writing-for-agents',
        'guides/search',
        'guides/custom-providers',
      ],
    },
    'upgrading',
  ],
  deploy: [
    'deploy/index',
    {
      type: 'category',
      label: 'Platforms',
      collapsed: false,
      items: [
        'deploy/vercel',
        'deploy/netlify',
        'deploy/cloudflare-workers',
        'deploy/deno-and-bun',
        'deploy/node',
        'deploy/static-hosts',
      ],
    },
    'deploy/troubleshooting',
  ],
  reference: [
    'reference/plugin-options',
    'reference/server-options',
    'reference/mcp-tools',
    'reference/artifact-bundle',
    'reference/api',
    'reference/cli',
  ],
};

export default sidebars;
