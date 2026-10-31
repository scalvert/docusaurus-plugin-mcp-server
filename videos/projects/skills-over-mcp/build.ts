/**
 * Ship Agent Skills with your docs.
 *
 * Scene by scene: what's on screen and where it came from lives in STORYBOARD.md.
 * Run: oncue narrate skills-over-mcp (once per script change), then oncue render skills-over-mcp.
 */
import { defineVideo, lines, wrap } from "oncue";
import { INTRO_SECONDS } from "../../composition/timing.ts";

interface Session {
  prompt: string;
  calls: { tool: string; input: Record<string, unknown> }[];
  answer: string;
}

export default defineVideo((v) => {
  // s6's answer streams while the narration describes it, and the gap after s6 leaves time to
  // read its source link without a long silence.
  // The pre-roll leaves room for the dino intro (composition/Intro.tsx).
  v.retime({ s1: 0.8, s2: 1.0, s3: 1.4, s4: 0.9, s5: 1.0, s6: 1.0 }, { preRoll: INTRO_SECONDS });
  const { cue } = v;
  const text = (f: string) => lines(v.readText(`capture/${f}`).trim());
  // A terminal wraps long lines; so does this, at the terminal's width.
  const wrapped = (ls: string[], width = 100) => ls.flatMap((l) => (l.length > width ? wrap(l, width) : [l])).join("\n");

  v.hero("s1", ["Ship Agent Skills", "with your docs."], [
    ["tools: what", "what your docs tools do"],
    ["skills: how", "Agent Skills fill that gap"],
  ]);

  // s2: the built-in skill, read from the bundle (capture/builtin.txt).
  const builtin = text("builtin.txt");
  const s2 = v.term("s2");
  s2.cmd("jq -r '.skills.skills[0].files[0].text' build/mcp/bundle.json \\", { at: cue("s2", "Every build includes"), cs: 0.014 });
  s2.cmd('  | grep -E "^desc|^[0-9]\\. |^- ./docs" | cut -c 1-80', { at: cue("s2", "Every build includes"), prompt: ">", cs: 0.014 });
  s2.pill("docs-research", { at: cue("s2", "docs research") });
  s2.lines(builtin[0]!, { at: cue("s2", "written from your site"), tone: "ok" });
  s2.lines(builtin.slice(1, 6).join("\n"), { at: cue("s2", "It tells the agent"), tone: "dim" });
  s2.lines(builtin.slice(6).join("\n"), { at: cue("s2", "maps where things are"), tone: "ok" });
  v.terminal("s2", s2, "BUILT IN", "example-docs", { fontSize: 22 });

  // s3: an author skill and the one config line that serves it.
  const s3 = v.term("s3");
  s3.cmd("find mcp-skills -type f", { at: cue("s3", "Add your own") });
  s3.lines(text("tree.txt").join("\n"), { at: cue("s3", "only your team knows"), tone: "ok" });
  s3.cmd("head -4 mcp-skills/example-api-errors/SKILL.md", { at: cue("s3", "Put each skill") });
  s3.lines(wrapped(text("skill-head.txt")), { at: cue("s3", "skill dot M D"), tone: "dim" });
  s3.cmd('grep -n "skills:" docusaurus.config.js', { at: cue("s3", "point the plugin") });
  s3.lines(text("config.txt").join("\n"), { at: cue("s3", "the parent folder"), tone: "ok" });
  v.terminal("s3", s3, "ADD YOUR OWN", "example-docs", { fontSize: 22 });

  // s4: the build packages the skills into the bundle (capture/build.txt).
  const s4 = v.term("s4");
  s4.cmd('npm run build 2>&1 | grep "\\[MCP\\]"', { at: cue("s4", "Build the site") });
  s4.lines(text("build.txt").join("\n"), { at: cue("s4", "checks every skill"), tone: "dim" });
  s4.pill("build/mcp/bundle.json", { at: cue("s4", "same bundle") });
  v.terminal("s4", s4, "BUILD", "example-docs");

  // s5: how a skill reaches the agent. A diagram, labeled as one (capture/initialize.json).
  v.flow("s5", "HOW AGENTS GET THEM", {
    lanes: [
      { id: "agent", title: "Your agent", sub: "Claude Code, Cursor, VS Code" },
      { id: "site", title: "yoursite.com/mcp", sub: "the docs M C P server" },
    ],
    messages: [
      { from: "agent", to: "site", label: "skills/list · skill:// resources", at: cue("s5", "skills extension") },
      { from: "site", to: "agent", label: "instructions: every skill's skill:// URI", at: cue("s5", "its instructions also list") },
      { from: "agent", to: "site", label: "docs_fetch skill://…/SKILL.md", at: cue("s5", "read it with docs fetch") },
    ],
    tag: "diagram · skills/list needs the skills extension; docs_fetch works in every host",
  });

  // s6: a real Claude Code session against the example site's server (capture/session.json).
  const session = v.readJson("capture/session.json") as Session;
  const agent = v.term("s6");
  // The prompt is shown on two lines, as a shell shows a quoted string that spans lines.
  const asked = session.prompt.slice(0, session.prompt.indexOf("What should I do?") + "What should I do?".length);
  const brk = asked.indexOf(" and the error code");
  agent.cmd(`claude -p "${asked.slice(0, brk)}`, { at: cue("s6", "Here's Claude Code"), cs: 0.012 });
  agent.cmd(`${asked.slice(brk + 1)}"`, { at: cue("s6", "a request that fails"), prompt: ">", cs: 0.012 });
  const show = (c: Session["calls"][number]) => `● ${c.tool}  ${String(c.input.url ?? JSON.stringify(c.input.query))}`;
  const [skill, search, fetch] = session.calls;
  agent.out(show(skill!), { at: cue("s6", "reads the error skill"), tone: "dim" });
  agent.out(show(search!), { at: cue("s6", "searches"), tone: "dim" });
  agent.out(show(fetch!), { at: cue("s6", "fetches the rate limiting"), tone: "dim" });
  agent.stream(session.answer, { at: cue("s6", "section, and answers"), width: 84, cs: 0.004 });
  v.terminal("s6", agent, "AGENT SESSION", "claude code", { fontSize: 22 });

  v.endCard("s7", "Read the Agent Skills guide.", "docusaurus-plugin-mcp-server.vercel.app");

  return v.props({ seriesTag: "docusaurus-plugin-mcp-server", extraSpoken: [["four twenty nine", "429"], ["skill dot M D", "SKILL.md"]] });
});
