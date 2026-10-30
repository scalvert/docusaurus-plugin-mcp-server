/**
 * Your Docusaurus docs, as an MCP server.
 *
 * Scene by scene: what's on screen and where it came from lives in STORYBOARD.md.
 * Run: oncue narrate docs-mcp-server (once per script change), then oncue render docs-mcp-server.
 */
import { defineVideo, lines } from "oncue";
import { INTRO_SECONDS } from "../../composition/timing.ts";

interface Session {
  prompt: string;
  calls: { tool: string; input: Record<string, unknown> }[];
  answer: string;
}

export default defineVideo((v) => {
  // s5 holds long enough to read the agent's answer and its source link.
  // The pre-roll leaves room for the dino intro (composition/Intro.tsx).
  v.retime({ s1: 0.8, s2: 0.9, s3: 1.0, s4: 0.9, s5: 1.0 }, { preRoll: INTRO_SECONDS });
  const { cue } = v;
  const text = (f: string) => lines(v.readText(`capture/${f}`).trim());

  v.hero("s1", ["Your Docusaurus docs,", "as an MCP server."], [
    ["docs_search", "your real docs"],
    ["docs_fetch", "M C P server"],
  ]);

  // s2: install and configure, both run in the example site (capture/install.txt, config.txt).
  // The install is the plain command from the plugin's README. It was captured with npm's audit
  // and funding notices turned off for that one process (see STORYBOARD.md).
  const setup = v.term("s2");
  setup.cmd("npm install docusaurus-plugin-mcp-server", { at: cue("s2", "Install it") });
  setup.lines(text("install.txt").join("\n"), { at: cue("s2", "and add it"), tone: "ok" });
  setup.cmd('grep -A 7 "plugins: [" docusaurus.config.js', { at: cue("s2", "add it to the plugins") });
  // Only trailing newlines are trimmed, so the config keeps its indentation.
  setup.lines(v.readText("capture/config.txt").replace(/\n+$/, ""), { at: cue("s2", "your Docusaurus config") });
  setup.pill("server.name", { at: cue("s2", "Give the server a name") });
  v.terminal("s2", setup, "SET IT UP", "example-docs");

  // s3: build, then the plugin's own check (capture/build.txt, verify.txt).
  const build = v.term("s3");
  build.cmd('npm run build 2>&1 | grep "\\[MCP\\]"', { at: cue("s3", "Build the site") });
  build.lines(text("build.txt").join("\n"), { at: cue("s3", "turns every page"), tone: "dim" });
  build.cmd("npx docusaurus-mcp-verify", { at: cue("s3", "the verify command") });
  const verify = text("verify.txt");
  build.lines(verify.slice(0, verify.findIndex((l) => l.includes("All checks passed")) + 1).join("\n"), { at: cue("s3", "starts a server") });
  v.terminal("s3", build, "BUILD AND VERIFY", "example-docs", { fontSize: 19 });

  // s4: how a request is served. A diagram, labeled as one.
  v.flow("s4", "ONE HANDLER", {
    lanes: [
      { id: "agent", title: "Your agent", sub: "Claude, Cursor, VS Code" },
      { id: "site", title: "yoursite.com/mcp", sub: "createWebRequestHandler" },
      { id: "bundle", title: "bundle.json", sub: "from the build" },
    ],
    messages: [
      { from: "agent", to: "site", label: "docs_search", at: cue("s4", "export one web request handler") },
      { from: "site", to: "bundle", label: "search the index", at: cue("s4", "same few lines") },
      { from: "site", to: "agent", label: "pages and links", at: cue("s4", "Vercel") },
    ],
    tag: "diagram · runs on Vercel, Netlify, Cloudflare Workers, Deno, Bun, Node",
  });

  // s5: a real Claude Code session against the example site's server (capture/session.json).
  const session = v.readJson("capture/session.json") as Session;
  const agent = v.term("s5");
  agent.cmd("claude mcp add --transport http example-docs http://localhost:3456 --scope project", { at: cue("s5", "connect your agent") });
  agent.lines(text("mcp-add.txt").join("\n"), { at: cue("s5", "Here's Claude Code"), tone: "dim" });
  agent.cmd(`claude -p "${session.prompt.split("?")[0]}?"`, { at: cue("s5", "with the example site") });
  const [skill, search, fetch] = session.calls;
  const show = (c: Session["calls"][number]) => `● ${c.tool}  ${String(c.input.url ?? JSON.stringify(c.input.query))}`;
  agent.out(show(skill!), { at: cue("s5", "reads the skill"), tone: "dim" });
  agent.out(show(search!), { at: cue("s5", "searches the docs"), tone: "dim" });
  agent.out(show(fetch!), { at: cue("s5", "fetches the page"), tone: "dim" });
  // The answer streams while the narration describes it, so it's whole before the end card
  // without a long silence after s5.
  agent.stream(session.answer, { at: cue("s5", "the page, and answers"), width: 84, cs: 0.004 });
  v.terminal("s5", agent, "AGENT SESSION", "claude code", { fontSize: 19 });

  v.endCard("s6", "Start with the getting started guide.", "docusaurus-plugin-mcp-server.vercel.app");

  return v.props({ seriesTag: "docusaurus-plugin-mcp-server" });
});
