// Writes tests/remix-inputs.mjs: one input timeline per Remix trail (#71), the plan that the
// human-rate witness in tests/courses.test.mjs replays. Input only: a timeline is the list of
// 50 ms samples at which the held input flips. Run it again after editing a Remix trail:
//   node --experimental-strip-types scripts/remix-witness.mjs
// The search plays the real engine through Run, decides every 50 ms like the witness, keeps
// presses 200 ms apart (the witness allows 100), and treats a second without progress as stuck.
// Each flip is then moved toward the middle of the range of samples that still finish the trail.
import { writeFileSync } from "node:fs";
import { Run } from "../src/run.ts";
import { STEP } from "../src/engine.ts";
import { REMIX } from "../src/remix.ts";

const GAP = 24, // ticks between presses in the plan
  STALL = 150, // ticks without forward progress count as stuck
  clone = (r) => {
    const c = Object.assign(Object.create(Run.prototype), r);
    c.state = {
      ...r.state,
      touchingPortals: [...r.state.touchingPortals],
      usedRings: [...r.state.usedRings],
    };
    return c;
  };

// The witness loop: decisions on ticks where tick % 6 === 0 once the ready interval is over.
function firstSampleTick(level) {
  const run = new Run(level);
  for (let tick = 0; ; tick++) {
    if (tick % 6 === 0 && run.readyTime <= 0) return tick;
    run.advance(STEP);
  }
}

function finishes(level, flips) {
  const run = new Run(level);
  let held = false,
    i = 0;
  for (let tick = 0; tick < 16000 && run.state.status === "playing"; tick++) {
    while (flips[i] === tick) {
      held = !held;
      held ? run.press() : run.release();
      i++;
    }
    run.advance(STEP);
  }
  return run.state.status === "complete";
}

// Depth-first over 50 ms decisions, remembering decision states that cannot finish.
function search(level) {
  const failed = new Set(),
    run = new Run(level),
    t0 = firstSampleTick(level);
  for (let i = 0; i < t0; i++) run.advance(STEP);
  const key = ({ run: { state: s, jumpBuffer }, tick, held, lastPress }) =>
    [tick, s.mode, s.gravity, s.speed, Math.round(s.y * 400), Math.round(s.vy * 40),
      s.grounded, held, s.wall === null, s.usedRings.join("."), jumpBuffer > 0,
      Math.min(GAP, tick - lastPress), Math.round(s.x * 100)].join("|");
  // planes and angles keep what they are doing; the other shapes prefer not to press
  const order = (n) =>
    ["plane", "angle"].includes(n.run.state.mode) ? [n.held, !n.held] : [false, true];
  const root = { run, tick: t0, held: false, lastPress: -Infinity, flips: [], moved: t0, mx: run.state.x };
  const stack = [{ node: root, options: order(root), i: 0 }];
  while (stack.length) {
    const top = stack.at(-1);
    if (top.i >= top.options.length) {
      failed.add(key(top.node));
      stack.pop();
      continue;
    }
    const want = top.options[top.i++],
      n = top.node;
    if (want && !n.held && n.tick - n.lastPress < GAP) continue;
    const next = clone(n.run);
    if (want && !n.held) next.press();
    else if (!want && n.held) next.release();
    for (let k = 0; k < 6 && next.state.status === "playing"; k++) next.advance(STEP);
    const s = next.state,
      flips = want === n.held ? n.flips : [...n.flips, n.tick];
    if (s.status === "complete") return flips;
    if (s.status === "dead") continue;
    const progressed = s.x > n.mx + 0.25,
      child = {
        run: next,
        tick: n.tick + 6,
        held: want,
        lastPress: want && !n.held ? n.tick : n.lastPress,
        flips,
        moved: progressed ? n.tick + 6 : n.moved,
        mx: progressed ? s.x : n.mx,
      };
    if (child.tick - child.moved > STALL || failed.has(key(child))) continue;
    stack.push({ node: child, options: order(child), i: 0 });
  }
  throw Error(`${level.name}: no input plan finishes this trail`);
}

// Slide each flip, one sample at a time, toward the middle of the samples that still finish.
function center(level, flips) {
  const out = [...flips];
  for (let i = 0; i < out.length; i++) {
    const press = i % 2 === 0,
      fits = (t) =>
        (i === 0 || t > out[i - 1]) &&
        (i === out.length - 1 || t < out[i + 1]) &&
        !(press && i >= 2 && t - out[i - 2] < GAP) &&
        !(press && i + 2 < out.length && out[i + 2] - t < GAP) &&
        finishes(level, out.map((f, j) => (j === i ? t : f)));
    let lo = out[i],
      hi = out[i];
    while (lo - out[i] > -30 && fits(lo - 6)) lo -= 6;
    while (hi - out[i] < 30 && fits(hi + 6)) hi += 6;
    out[i] = lo + Math.floor((hi - lo) / 12) * 6;
  }
  return finishes(level, out) ? out : flips;
}

const lines = REMIX.map((level) => {
  const t0 = firstSampleTick(level),
    samples = center(level, search(level)).map((t) => (t - t0) / 6);
  console.log(`${level.name}: ${samples.length} flips`);
  return `  ${JSON.stringify(level.name)}: [${samples.join(", ")}],`;
});
writeFileSync(
  new URL("../tests/remix-inputs.mjs", import.meta.url),
  `// Generated by scripts/remix-witness.mjs. For each Remix trail, the 50 ms samples (counted
// from the witness's first sample) at which the held input flips; every run starts released.
export const REMIX_INPUTS = {
${lines.join("\n")}
};
`,
);
