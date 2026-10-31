/**
 * oncue's built-in Explainer, with the dino intro drawn over its pre-roll: the dino pops in, spins
 * the MCP card twice between its paws, and settles. Then it shrinks into the logo's place in the
 * top-right corner as the first scene and the wordmark fade in. Every pose is a function of the
 * frame, so renders are deterministic.
 */
import React from "react";
import Explainer from "oncue/composition/Explainer.tsx";
import type { ExplainerProps } from "oncue/composition/props.ts";
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "oncue/composition/runtime/index.tsx";
import { Dino, type DinoPose } from "./Dino.tsx";

const W = 1920;
const H = 1080;
const SIZE = 500;
// Where the Explainer's v2 wordmark draws the logo: top 52, right 160, height 56 (oncue.config.ts).
const LOGO = { cx: W - 160 - 28, cy: 52 + 28, size: 56 };

const clamp = (x: number, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const lerp = (a: number, b: number, x: number) => a + (b - a) * x;
const ease = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
// A pop that overshoots a little, then settles.
const pop = (x: number) => (x <= 0 ? 0 : x >= 1 ? 1 : 1 - Math.cos(x * Math.PI * 2.5) * Math.exp(-5 * x));

const SPIN_FROM = 0.4;
const SPIN_TO = 1.6;

/** The card's turn and the body's bob at `t` seconds into the intro. */
function pose(t: number): DinoPose {
  if (t < SPIN_FROM) return { turn: 0, bob: 0 };
  if (t < SPIN_TO) {
    const turn = 4 * Math.PI * ease((t - SPIN_FROM) / (SPIN_TO - SPIN_FROM));
    return { turn, bob: -1 * Math.abs(Math.sin(turn)) };
  }
  // A damped wobble as the card settles; it ends facing front.
  const s = t - SPIN_TO;
  const wobble = 0.35 * Math.sin(s * 18) * Math.exp(-s * 7);
  return { turn: Math.abs(wobble) < 0.002 ? 0 : wobble, bob: 0 };
}

const DinoIntro: React.FC<{ preRoll: number }> = ({ preRoll }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  // The dino flies to the logo over the last 0.45 s of the pre-roll and lands just after it ends,
  // on the spot where the wordmark's own logo fades in (over 0.35 s). It stays opaque until that
  // logo is fully in, then goes: the two are drawn in the same place, so the swap can't be seen.
  // A crossfade would make both half-transparent.
  const flyFrom = preRoll - 0.45;
  const land = preRoll + 0.05;
  const gone = preRoll + 0.36;
  if (t >= gone) return null;
  const f = ease(clamp((t - flyFrom) / (land - flyFrom)));
  const size = lerp(SIZE * pop(clamp(t / 0.45)), LOGO.size, f);
  const cx = lerp(W / 2, LOGO.cx, f);
  const cy = lerp(H / 2, LOGO.cy, f);
  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      <Dino pose={pose(t)} size={size} style={{ position: "absolute", left: cx - size / 2, top: cy - size / 2 }} />
    </AbsoluteFill>
  );
};

const Video: React.FC<ExplainerProps> = (props) => {
  const preRoll = typeof props.preRoll === "number" ? props.preRoll : 0;
  return (
    <>
      <Explainer {...props} />
      {preRoll > 0 && <DinoIntro preRoll={preRoll} />}
    </>
  );
};

export default Video;
