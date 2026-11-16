// Writes tests/remix-inputs.mjs: one input timeline per Remix trail (#71), the plan that the
// human-rate witness in tests/courses.test.mjs replays. Input only: a timeline is the list of
// 50 ms samples at which the held input flips. Run it again after editing a Remix trail:
//   node --experimental-strip-types scripts/remix-witness.mjs
// The search plays the real engine through Run, decides every 50 ms like the witness, keeps
// presses 200 ms apart (the witness allows 100), and treats a second without progress as stuck.
// Each flip is then moved toward the middle of the range of samples that still finish the trail.
// Name trails to re-record only those, each from a given x on, keeping every flip it already had
// before that x (the rest of the file is kept as it is):
//   node --experimental-strip-types scripts/remix-witness.mjs "Block Party@126"
import { writeFileSync } from "node:fs";
import { Run } from "../src/run.ts";
import { STEP, SIZE, BLOCKS, SLOPES, parts, polygon, intersects } from "../src/engine.ts";
import { REMIX } from "../src/remix.ts";
import { REMIX_INPUTS } from "../tests/remix-inputs.mjs";

const GAP = 24, // ticks between presses in the plan
  STALL = 150, // ticks without forward progress count as stuck
  CLEAR = 0.01, // how far the angle keeps off a solid face in the plan
  // The angle dies on solid contact (#106). The plan keeps it CLEAR of every solid it is not held
  // against by a W, so a recorded path never rests on the contact tolerance.
  grazes = (s) => {
    if (s.mode !== "angle" || s.status !== "playing") return false;
    const box = (d) => [
        [s.x - d, s.y - d],
        [s.x + SIZE + d, s.y - d],
        [s.x + SIZE + d, s.y + SIZE + d],
        [s.x - d, s.y + SIZE + d],
      ],
      inW = s.level.objects.some((o) => o.type === "w-block" && intersects(box(0), polygon(o)));
    return s.level.objects.some(
      (o) =>
        !o.noTouch &&
        o.layer !== "background" &&
        (BLOCKS.includes(o.type) || SLOPES.includes(o.type)) &&
        !(inW || o.wallPass) &&
        parts(o).some((part) => intersects(box(CLEAR), part)),
    );
  },
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
    if (grazes(run.state)) return false;
  }
  return run.state.status === "complete";
}

// The kept part of a re-recording: the old flips played until the first decision at or past x.
function prefix(level, flips, x) {
  const run = new Run(level),
    kept = [];
  let held = false,
    lastPress = -Infinity,
    i = 0;
  for (let tick = 0; ; tick++) {
    if (tick >= firstSampleTick(level) && (tick - firstSampleTick(level)) % 6 === 0 && run.state.x >= x)
      return { run, tick, held, lastPress, flips: kept, moved: tick, mx: run.state.x };
    while (flips[i] === tick) {
      held = !held;
      if (held) {
        run.press();
        lastPress = tick;
      } else run.release();
      kept.push(tick);
      i++;
    }
    run.advance(STEP);
    if (run.state.status !== "playing") throw Error(`${level.name}: the kept flips do not reach x ${x}`);
  }
}

// Depth-first over 50 ms decisions, remembering decision states that cannot finish.
function search(level, from) {
  const failed = new Set(),
    run = new Run(level),
    t0 = firstSampleTick(level);
  for (let i = 0; i < t0; i++) run.advance(STEP);
  const key =({ run: { state: s, jumpBuffer }, tick, held, lastPress }) =>
    [tick, s.mode, s.gravity, s.speed, Math.round(s.y * 400), Math.round(s.vy * 40),
      s.grounded, held, s.wall === null, s.usedRings.join("."), jumpBuffer > 0,
      Math.min(GAP, tick - lastPress), Math.round(s.x * 100)].join("|");
  // planes and angles keep what they are doing; the other shapes prefer not to press
  const order = (n) =>
    ["plane", "angle"].includes(n.run.state.mode) ? [n.held, !n.held] : [false, true];
  const root = from ?? { run, tick: t0, held: false, lastPress: -Infinity, flips: [], moved: t0, mx: run.state.x };
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
    let grazed = false;
    for (let k = 0; k < 6 && next.state.status === "playing"; k++) {
      next.advance(STEP);
      grazed ||= grazes(next.state);
    }
    if (grazed) continue;
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

// Slide each flip, one sample at a time, toward the middle of the samples that still finish. A
// re-recording leaves the kept flips where they were.
function center(level, flips, kept = 0) {
  const out = [...flips];
  for (let i = kept; i < out.length; i++) {
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

const only = new Map(
  process.argv.slice(2).map((arg) => {
    const [name, x] = arg.split("@");
    return [name, Number(x ?? 0)];
  }),
);
const lines = REMIX.map((level) => {
  const t0 = firstSampleTick(level);
  if (only.size && !only.has(level.name))
    return `  ${JSON.stringify(level.name)}: [${REMIX_INPUTS[level.name].join(", ")}],`;
  const from = only.get(level.name)
      ? prefix(level, REMIX_INPUTS[level.name].map((s) => t0 + s * 6), only.get(level.name))
      : undefined,
    samples = center(level, search(level, from), from?.flips.length).map((t) => (t - t0) / 6);
  console.log(`${level.name}: ${samples.length} flips, ${from?.flips.length ?? 0} kept`);
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
