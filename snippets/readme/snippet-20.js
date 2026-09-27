// docusaurus.config.js
module.exports = {
  plugins: [
    [
      'docusaurus-plugin-mcp-server',
      {
        server: { name: 'my-docs' },
        // Serve the built-in docs-research skill plus every skill in ./mcp-skills
        skills: { dir: 'mcp-skills' },
      },
    ],
  ],
};
