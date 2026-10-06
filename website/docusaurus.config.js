// @ts-check
import { readFileSync } from 'node:fs';
import { themes as prismThemes } from 'prism-react-renderer';

/** The package this site documents, read from the repo root so the site always shows the version it was built from. */
const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

const repoUrl = 'https://github.com/scalvert/docusaurus-plugin-mcp-server';
const npmUrl = 'https://www.npmjs.com/package/docusaurus-plugin-mcp-server';

// The production URL. Every page URL the MCP server returns is built from this,
// so it must match the domain the site is served from. Override with SITE_URL
// (for example when serving the build locally).
const siteUrl = process.env.SITE_URL ?? 'https://docusaurus-plugin-mcp-server.vercel.app';

/** @type {import('@docusaurus/types').Config} */
const config = {
  title: 'docusaurus-plugin-mcp-server',
  tagline: 'Serve your Docusaurus docs to AI agents over MCP',
  favicon: 'img/favicon.png',

  url: siteUrl,
  baseUrl: '/',
  trailingSlash: false,

  organizationName: 'scalvert',
  projectName: 'docusaurus-plugin-mcp-server',

  onBrokenLinks: 'throw',
  onBrokenAnchors: 'throw',

  customFields: {
    packageVersion: pkg.version,
    repoUrl,
    npmUrl,
  },

  markdown: {
    hooks: {
      onBrokenMarkdownLinks: 'throw',
    },
  },

  future: {
    v4: true,
  },

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
          editUrl: `${repoUrl}/edit/main/website/`,
        },
        blog: false,
        theme: {
          customCss: './src/css/custom.css',
        },
      }),
    ],
  ],

  plugins: [
    // The migration guides live in the repo's migrations/ directory (they ship
    // with the package and errors link to them). Rendering them from there keeps
    // one copy.
    [
      '@docusaurus/plugin-content-docs',
      /** @type {import('@docusaurus/plugin-content-docs').Options} */
      ({
        id: 'migrations',
        path: '../migrations',
        routeBasePath: 'migrations',
        sidebarPath: './sidebars-migrations.js',
        editUrl: `${repoUrl}/edit/main/`,
        // File names are versions (2.x-3.0.0.md); don't read "2." as an ordering prefix.
        numberPrefixParser: false,
      }),
    ],
    // This site dogfoods the plugin: the build writes build/mcp/bundle.json and
    // api/mcp.js serves it at /mcp.
    [
      'docusaurus-plugin-mcp-server',
      /** @type {import('docusaurus-plugin-mcp-server').McpServerPluginOptions} */
      ({
        server: {
          name: 'docusaurus-plugin-mcp-server',
          version: pkg.version,
        },
      }),
    ],
  ],

  themeConfig:
    /** @type {import('@docusaurus/preset-classic').ThemeConfig} */
    ({
      colorMode: {
        respectPrefersColorScheme: true,
      },
      docs: {
        sidebar: {
          hideable: true,
        },
      },
      navbar: {
        title: 'MCP Server',
        logo: {
          alt: 'The Docusaurus dinosaur hugging the MCP logo',
          src: 'img/logo.svg',
        },
        items: [
          {
            type: 'docSidebar',
            sidebarId: 'docs',
            position: 'left',
            label: 'Docs',
          },
          {
            type: 'docSidebar',
            sidebarId: 'deploy',
            position: 'left',
            label: 'Deploy',
          },
          {
            type: 'docSidebar',
            sidebarId: 'reference',
            position: 'left',
            label: 'Reference',
          },
          {
            href: `${repoUrl}/blob/main/CHANGELOG.md`,
            label: `v${pkg.version}`,
            position: 'right',
          },
          {
            type: 'custom-mcpInstall',
            position: 'right',
          },
          {
            href: repoUrl,
            position: 'right',
            className: 'header-github-link',
            'aria-label': 'GitHub repository',
          },
        ],
      },
      footer: {
        style: 'dark',
        links: [
          {
            title: 'Docs',
            items: [
              { label: 'Getting started', to: '/docs/getting-started' },
              { label: 'Deploy', to: '/docs/deploy' },
              { label: 'Reference', to: '/docs/reference/plugin-options' },
              { label: 'Upgrading', to: '/docs/upgrading' },
            ],
          },
          {
            title: 'Project',
            items: [
              { label: 'GitHub', href: repoUrl },
              { label: 'npm', href: npmUrl },
              { label: 'Changelog', href: `${repoUrl}/blob/main/CHANGELOG.md` },
              { label: 'Issues', href: `${repoUrl}/issues` },
            ],
          },
          {
            title: 'Related',
            items: [
              { label: 'Docusaurus', href: 'https://docusaurus.io' },
              { label: 'Model Context Protocol', href: 'https://modelcontextprotocol.io' },
              { label: 'Agent Skills', href: 'https://agentskills.io' },
            ],
          },
        ],
        copyright: `Copyright © ${new Date().getFullYear()} Steve Calvert. MIT licensed. Built with Docusaurus.`,
      },
      prism: {
        theme: prismThemes.github,
        darkTheme: prismThemes.dracula,
        additionalLanguages: ['bash', 'json', 'toml', 'nginx', 'docker', 'yaml'],
      },
    }),
};

export default config;
