import { test } from "node:test";
import assert from "node:assert/strict";
import { newSpin, spinAt, QUARTER, TURN, SETTLE } from "../src/spin.ts";
import { createState, SIZE } from "../src/engine.ts";
import { LEVELS } from "../src/levels.ts";
import { AVATAR } from "../src/render.ts";
import { canvasLog, player } from "./canvas-log.mjs";

// The cube's turn (#120): the look only. The body and every step of a run are untouched (the
// engine does not know about it), so these pin the drawing and nothing else.
const near = (a, b, what) => assert.ok(Math.abs(a - b) < 1e-9, `${what}: ${a} vs ${b}`);
const cube = (over = {}) => ({ ...createState(LEVELS[0]), mode: "square", gravity: -1, x: 9, y: 2, grounded: true, ...over });
// one spin driven through a list of [time, grounded] moments, the angle at each
function drive(moments, over = {}) {
  const s = newSpin(), state = cube(over);
  return moments.map(([time, grounded, extra]) => spinAt(s, Object.assign(state, { time, grounded, ...extra })));
}

test("in the air it turns forward from the side it took off on, one turn a second", () => {
  const [rest, takeoff, quarter, half] = drive([[0, true], [1, false], [1.25, false], [1.5, false]]);
  near(rest.angle, 0, "upright on the ground");
  near(takeoff.angle, 0, "starts from its side");
  near(quarter.angle, QUARTER, "a quarter turn forward (clockwise on screen) after 0.25 s");
  near(half.angle, 2 * QUARTER, "half a turn after 0.5 s");
});

test("it lands on the nearest flat side, settles there in a tenth of a second and stays", () => {
  // 0.3 s up is 108 degrees: the nearest side is 90
  const [, , landing, mid, done, later] = drive([[0, true], [1, false], [1.3, true], [1.3 + SETTLE / 2, true], [1.3 + SETTLE, true], [9, true]]);
  near(landing.angle, 0.3 * TURN, "it lands at the angle it turned to");
  assert.ok(mid.angle < landing.angle && mid.angle > QUARTER, "and eases back onto the side");
  near(done.angle, QUARTER, "on its side");
  near(later.angle, QUARTER, "and stays there");
  near(later.side, 1, "an odd side");
  // 0.2 s up is 72 degrees: also nearest 90, eased forward
  near(drive([[0, true], [0.1, false], [0.3, true], [1, true]]).at(-1).angle, QUARTER, "forward onto the side");
  // 0.05 s up is 18 degrees: back down flat
  near(drive([[0, true], [0.1, false], [0.15, true], [1, true]]).at(-1).angle, 0, "a hop settles upright again");
});

test("the next jump turns on from where it rests, and it can rest upside down", () => {
  const out = drive([[0, true], [1, false], [1.25, true], [2, true], [3, false], [3.25, false], [3.3, true], [4, true]]);
  near(out[3].angle, QUARTER, "on its side after the first jump");
  near(out[4].angle, QUARTER, "takes off from its side");
  near(out[5].angle, 2 * QUARTER, "turns on from there");
  near(out[7].angle, 2 * QUARTER, "and rests upside down");
  near(out[7].side, 0, "upside down is not a sideways footprint");
});

test("a take-off during the settle starts from where the ease had got to", () => {
  const out = drive([[0, true], [1, false], [1.3, true], [1.3 + SETTLE / 2, false]]);
  assert.ok(out[3].angle < 0.3 * TURN && out[3].angle > QUARTER);
});

test("the rest is always a whole side in one turn, however many jumps", () => {
  const s = newSpin(), state = cube();
  let t = 0, last;
  for (let i = 0; i < 400; i++) {
    spinAt(s, Object.assign(state, { time: (t += 0.1), grounded: false }));
    spinAt(s, Object.assign(state, { time: (t += 0.37 + (i % 7) / 10), grounded: true }));
    last = spinAt(s, Object.assign(state, { time: (t += 1), grounded: true }));
    assert.ok(s.rest >= 0 && s.rest < TURN, `rest ${s.rest}`);
    near(s.rest / QUARTER, Math.round(s.rest / QUARTER), "a whole quarter");
    near(last.angle, s.rest, "settled");
  }
});

test("another mode puts it upright for the next time it is a cube, and pogo turns like the cube", () => {
  const out = drive([[0, true], [1, false], [1.25, true], [2, true], [2.1, true, { mode: "plane" }], [2.2, true, { mode: "square" }]]);
  near(out[3].angle, QUARTER, "on its side");
  near(out[5].angle, 0, "upright after a plane portal");
  const pogo = drive([[0, true], [1, false], [1.25, false]], { mode: "pogo" });
  near(pogo[2].angle, QUARTER, "pogo turns too");
});

test("a run that starts again starts upright", () => {
  const s = newSpin(), state = cube();
  spinAt(s, Object.assign(state, { time: 1, grounded: false }));
  spinAt(s, Object.assign(state, { time: 1.25, grounded: true }));
  near(spinAt(s, Object.assign(state, { time: 2, grounded: true })).angle, QUARTER, "on its side");
  near(spinAt(s, Object.assign(state, { time: 0, grounded: true })).angle, 0, "time went back: a new run");
});

// ---- what render draws ----

const frame = (state, extra = {}) => canvasLog({ state, level: LEVELS[0], camera: 5, cameraY: 1, time: 0.2, reduced: false, ...extra });
const rotations = (log) => player(log).filter((c) => c[0] === "rotate");
const at = (state, time, grounded, extra) => {
  Object.assign(state, { time, grounded });
  return frame(state, extra).log;
};

test("upright on the ground draws exactly as before: no turn at all", () => {
  for (const mode of ["square", "pogo"])
    for (const gravity of [-1, 1]) {
      const state = cube({ mode, gravity });
      assert.deepEqual(rotations(at(state, 0, true)), [], `${mode} g${gravity}`);
    }
});

test("render turns the cube clockwise in the air and keeps the side it lands on", () => {
  const state = cube();
  at(state, 0, true);
  at(state, 1, false);
  assert.deepEqual(rotations(at(state, 1.25, false)).map((c) => c[1]), [QUARTER]);
  at(state, 1.25, true);
  const rest = rotations(at(state, 3, true)).map((c) => c[1]);
  near(rest[0], QUARTER, "on its side on the ground");
  // reduced motion never turns it, in the air or at rest
  assert.deepEqual(rotations(at(state, 3, true, { reduced: true })), []);
});

test("under upside-down gravity the drawing mirrors before it turns, so the turn is the mirror image", () => {
  const state = cube({ gravity: 1 });
  at(state, 0, true);
  at(state, 1, false);
  const log = player(at(state, 1.25, false));
  const mirror = log.findIndex((c) => c[0] === "scale" && c[1] === 1 && c[2] === -1),
    turn = log.findIndex((c) => c[0] === "rotate");
  assert.ok(mirror >= 0 && turn > mirror);
});

test("a skin on its side stands in the swapped box: feet on the ground, centred on the body", () => {
  const art = { image: { tiny: "16x8" }, width: 16, height: 8 };
  for (const gravity of [-1, 1]) {
    const state = cube({ gravity });
    at(state, 0, true, { skin: art });
    at(state, 1, false, { skin: art });
    at(state, 1.25, true, { skin: art });
    const { log, view } = frame(Object.assign(state, { time: 3 }), { skin: art });
    const [, left, top, right, bottom] = log.find((c) => c[0] === "screen");
    const X = (x) => (x - view.camera) * view.unit,
      Y = (y) => view.floor - (y - view.cameraY) * view.unit;
    near(bottom - top, AVATAR * view.unit, "the long side stands up");
    near((right - left) * 2, bottom - top, "half as wide");
    if (gravity < 0) near(bottom, Y(state.y), "feet on the body's bottom edge");
    else near(top, Y(state.y + SIZE), "head on the body's top edge");
    near((left + right) / 2, X(state.x + SIZE / 2), "centred on the body");
  }
});
