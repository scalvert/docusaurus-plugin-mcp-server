/**
 * Turn a docs page into an agent guide.
 *
 * Scene by scene: what's on screen and where it came from lives in STORYBOARD.md.
 * Run: oncue narrate agent-guides (once per script change), then oncue render agent-guides.
 */
import { defineVideo, lines, wrap } from "oncue";
import { INTRO_SECONDS } from "../../composition/timing.ts";

interface Session {
  prompt: string;
  calls: { tool: string; input: Record<string, unknown> }[];
  answer: string;
}
interface Box { x: number; y: number; width: number; height: number }

// The example site, served locally from its build (capture/pages.json).
const URL = "localhost:3000/docs/getting-started/installation";
const SIZE: [number, number] = [2880, 1800];
const WIDE = { cx: 1440, cy: 810, w: 2880 };

export default defineVideo((v) => {
  // s7's answer streams while the narration describes it, and the gap after s7 leaves time to
  // read its source link without a long silence.
  // The pre-roll leaves room for the dino intro (composition/Intro.tsx).
  v.retime({ s1: 0.8, s2: 1.0, s3: 1.0, s4: 0.6, s5: 1.0, s6: 1.0, s7: 1.0 }, { preRoll: INTRO_SECONDS });
  const { cue } = v;
  const text = (f: string) => lines(v.readText(`capture/${f}`).trim());
  // A terminal wraps long lines; so does this, at the terminal's width.
  const wrapped = (ls: string[], width = 100) => ls.flatMap((l) => (l.length > width ? wrap(l, width) : [l])).join("\n");
  const targets = v.readJson("capture/targets.json") as Record<string, Record<string, Box>>;
  const pad = 14;
  const hl = (c: ReturnType<typeof v.capture>, at: number, until: number, b: Box) =>
    c.hl(at, until, b.x - pad, b.y - pad, b.width + 2 * pad, b.height + 2 * pad);

  v.hero("s1", ["Turn a docs page", "into an agent guide."], [
    ["for people", "Your setup page"],
    ["for agents", "a skill an agent can follow"],
  ]);

  // s2: the page as people see it (capture/page-install.png).
  let [s, e] = v.span("s2");
  let c = v.capture({ start: s, url: URL, size: SIZE, image: v.asset("capture/page-install.png", "page-install.png"), wide: WIDE, eyebrow: "Installation page" });
  const install = targets["page-install"]!;
  c.cam(cue("s2", "install the package") - 0.1, { cy: 560, w: 2100, cx: 1460 });
  hl(c, cue("s2", "install the package"), cue("s2", "check that it works") - 0.1, install.heading!);
  hl(c, cue("s2", "check that it works"), e, install.check!);
  v.addCapture(c, "s2", e);

  // s3: the markup on that page (capture/markup.txt).
  const markup = text("markup.txt");
  const s3 = v.term("s3");
  s3.cmd('grep -n -E "^<(AgentGuide|Step|Check|For|Symptom)" docs/getting-started/installation.md', { at: cue("s3", "Wrap the procedure"), cs: 0.014 });
  s3.lines(markup[0]!, { at: cue("s3", "Agent Guide"), tone: "ok" });
  s3.lines(markup.slice(1, 9).join("\n"), { at: cue("s3", "each step in a Step") });
  s3.pill("<Check>", { at: cue("s3", "a Check that says") });
  s3.lines(markup.slice(9).join("\n"), { at: cue("s3", "add a Symptom"), tone: "ok" });
  v.terminal("s3", s3, "MARK IT UP", "example-docs", { fontSize: 22 });

  // s4: ForHumans shows on the page; ForAgents doesn't (capture/page-env.png).
  [s, e] = v.span("s4");
  c = v.capture({ start: s, url: URL, size: SIZE, image: v.asset("capture/page-env.png", "page-env.png"), wide: WIDE, eyebrow: "What people see" });
  const env = targets["page-env"]!;
  c.cam(cue("s4", "For Humans") - 0.1, { cy: 520, w: 2100, cx: 1460 });
  hl(c, cue("s4", "For Humans"), e, env.forHumans!);
  v.addCapture(c, "s4", e);

  // s5: what agents get from docs_fetch, and the hidden block in the page's HTML.
  const view = text("agent-view.md");
  const from = view.indexOf("## Environment Variables");
  const forAgents = view.findIndex((l) => l.startsWith("The user creates the key"));
  const s5 = v.term("s5");
  s5.pill("docs_fetch · agent view", { at: cue("s5", "goes only to agents") });
  s5.out("docs_fetch  https://example.com/docs/getting-started/installation", { at: cue("s5", "For Agents is hidden"), tone: "agent" });
  s5.lines(view.slice(from, forAgents).join("\n"), { at: cue("s5", "goes only to agents"), tone: "dim" });
  s5.lines(wrapped([view[forAgents]!]), { at: cue("s5", "never ask for the key"), tone: "ok" });
  s5.cmd(`grep -o 'data-mcp-audience="agents" hidden=""' build/docs/getting-started/installation/index.html`, { at: cue("s5", "hidden, not secret"), cs: 0.012 });
  s5.lines(text("hidden.txt").join("\n"), { at: cue("s5", "the page's source") });
  v.terminal("s5", s5, "WHAT AGENTS GET", "example-docs", { fontSize: 22 });

  // s6: the build compiles the guide into a skill (capture/build.txt, compiled-outline.txt).
  const outline = text("compiled-outline.txt");
  const s6 = v.term("s6");
  s6.cmd('npm run build 2>&1 | grep "Packaged"', { at: cue("s6", "Build the site") });
  s6.lines(text("build.txt").filter((l) => l.includes("Packaged")).join("\n"), { at: cue("s6", "the guide compiles"), tone: "ok" });
  s6.pill("skill://setup-example-sdk/SKILL.md", { at: cue("s6", "named after it") });
  s6.cmd(`jq -r '.skills.skills[2].files[0].text' build/mcp/bundle.json | grep -E "^###|^\\*\\*(Needs|Check)"`, { at: cue("s6", "Steps come in order"), cs: 0.012 });
  s6.lines(outline.slice(0, 3).join("\n"), { at: cue("s6", "each with its check") });
  s6.lines(outline.slice(3, 4).join("\n"), { at: cue("s6", "Needs the user"), tone: "ok" });
  s6.lines(outline.slice(4).join("\n"), { at: cue("s6", "Needs the user") + 0.6 });
  v.terminal("s6", s6, "BUILD", "example-docs", { fontSize: 22 });

  // s7: a real Claude Code session against the example site's server (capture/session.json).
  // The prompt is shown on two lines, as a shell shows a quoted string that spans lines.
  const session = v.readJson("capture/session.json") as Session;
  const colon = session.prompt.indexOf(": ");
  const first = session.prompt.slice(0, colon);
  const rest = session.prompt.slice(colon + 2);
  const agent = v.term("s7");
  agent.cmd(`claude -p "${first}:`, { at: cue("s7", "Now an agent hits"), cs: 0.012 });
  agent.cmd(`${rest.split("How do I fix it?")[0]}How do I fix it?"`, { at: cue("s7", "module not found"), prompt: ">", cs: 0.012 });
  const show = (c: Session["calls"][number]) => `● ${c.tool}  ${String(c.input.url ?? JSON.stringify(c.input.query))}`;
  const [guide, search, trouble] = session.calls;
  agent.out(show(guide!), { at: cue("s7", "reads the guide"), tone: "dim" });
  agent.out(show(search!), { at: cue("s7", "searches"), tone: "dim" });
  agent.out(show(trouble!), { at: cue("s7", "opens its"), tone: "dim" });
  agent.stream(session.answer, { at: cue("s7", "troubleshooting, and answers"), width: 84, cs: 0.004 });
  v.terminal("s7", agent, "AGENT SESSION", "claude code", { fontSize: 22 });

  v.endCard("s8", "Start with the agent guides page.", "docusaurus-plugin-mcp-server.vercel.app");

  return v.props({ seriesTag: "docusaurus-plugin-mcp-server", extraSpoken: [["Agent Guide", "AgentGuide"], ["For Humans", "ForHumans"], ["For Agents", "ForAgents"]] });
});
