import { defineConfig } from "oncue";

// Every field is optional. See https://github.com/scalvert/oncue#configuration
export default defineConfig({
  // Small label on title, statement, and end scenes.
  brandLabel: "docusaurus-plugin-mcp-server",
  theme: {
    // The docs site's primary green, and the dino's green for highlights.
    colors: { accent: "#2E8555", highlight: "#44D860" },
    logo: { src: "brand/dino-mcp-yellow.svg", height: 56 },
  },
  // Spoken forms captions show as written.
  captions: { spoken: [["M C P", "MCP"]] },
  // oncue's built-in composition, with the dino intro drawn over each video's pre-roll.
  composition: "composition/Intro.tsx",
});
