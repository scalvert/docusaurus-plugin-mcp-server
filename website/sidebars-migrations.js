// @ts-check

/** @type {import('@docusaurus/plugin-content-docs').SidebarsConfig} */
const sidebars = {
  migrations: [
    {
      type: 'link',
      label: '← Upgrading overview',
      href: '/docs/upgrading',
    },
    {
      type: 'category',
      label: 'Migration guides',
      collapsed: false,
      items: ['2.x-3.0.0', '1.x-2.0.0', '0.13.0-1.0.0'],
    },
  ],
};

export default sidebars;
