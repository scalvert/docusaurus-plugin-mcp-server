// @ts-check

/** @type {import('@docusaurus/types').Config} */
const config = {
  title: 'Example Docs',
  tagline: 'Documentation with MCP Server',
  favicon: 'img/favicon.ico',

  // Set the production url of your site here
  url: 'https://example.com',
  baseUrl: '/',

  // GitHub pages deployment config (not used in this example)
  organizationName: 'example',
  projectName: 'docs',

  onBrokenLinks: 'throw',
  onBrokenMarkdownLinks: 'warn',

  i18n: {
    defaultLocale: 'en',
    locales: ['en'],
  },

  presets: [
    [
      'classic',
      /** @type {import('@docusaurus/preset-classic').Options} */
      ({
        docs: {
          sidebarPath: './sidebars.js',
        },
        theme: {
          customCss: './src/css/custom.css',
        },
      }),
    ],
  ],

  plugins: [
    [
      'docusaurus-plugin-mcp-server',
      {
        server: {
          name: 'example-docs',
          version: '1.0.0',
        },
        // Optional: customize content extraction
        // contentSelectors: ['article', 'main'],
        // excludeRoutes: ['/404*', '/search*'],
      },
    ],
  ],

  themeConfig:
    /** @type {import('@docusaurus/preset-classic').ThemeConfig} */
    ({
      navbar: {
        title: 'Example Docs',
        items: [
          {
            type: 'docSidebar',
            sidebarId: 'tutorialSidebar',
            position: 'left',
            label: 'Docs',
          },
        ],
      },
      footer: {
        style: 'dark',
        copyright: `Copyright © ${new Date().getFullYear()} Example. Built with Docusaurus.`,
      },
    }),
};

export default config;
