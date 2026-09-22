import { test } from "node:test";
import assert from "node:assert/strict";
import { object, polygon, bounds, createState, step, validateLevel, transform, rampSurface, SIZE } from "../src/engine.ts";

const level = (objects) => ({ name: "Rotate test", length: 40, objects });
const near = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-9, `${msg}: ${a} vs ${b}`);

test("quarter turns stay exactly axis-aligned; any other angle is a real rotation about the centre", () => {
  const block = object("block", 5, 2);
  for (const rotation of [0, 90, 180, 270]) {
    for (const [x, y] of polygon({ ...block, rotation })) {
      assert.ok(Number.isInteger(x * 2) && Number.isInteger(y * 2), `exact half-cells at ${rotation}: ${x},${y}`);
    }
  }
  const b = bounds({ ...block, rotation: 45 });
  const half = Math.SQRT1_2;
  near(b.left, 5.5 - half, "left"); near(b.right, 5.5 + half, "right");
  near(b.bottom, 2.5 - half, "bottom"); near(b.top, 2.5 + half, "top");
  // the quarter buttons add 90 on top of a free angle
  assert.equal(transform({ ...block, rotation: 30 }, "cw").rotation, 300);
  assert.equal(transform({ ...block, rotation: 30 }, "ccw").rotation, 120);
});

test("free angles are valid on blocks, spikes and ramps only", () => {
  for (const type of ["block", "spike", "ramp"]) assert.doesNotThrow(() => validateLevel(level([{ ...object(type, 10, 1), rotation: 33 }])));
  for (const type of ["ring", "plane"]) assert.throws(() => validateLevel(level([{ ...object(type, 10, 1), rotation: 33 }])), /Invalid object/);
  for (const rotation of [-1, 360, 400, NaN, "45"]) assert.throws(() => validateLevel(level([{ ...object("block", 10, 1), rotation }])), /Invalid object/);
});

test("a tilted block supports the player along its real top edge, not its bounding box", () => {
  // a 4x block tilted 20 degrees about its cell centre. its top edge is a 20 degree slope running
  // from about (5.42, 3.10) up to (9.18, 4.47); its bounding-box top is that high corner, 4.47.
  const slab = { ...object("block", 8, 0), scale: 4, rotation: 20 };
  const top = bounds(slab).top;
  // a body on a slope rests on the highest point of the edge under its footprint
  const rest = (x) => rampSurface(slab, x, x + SIZE, true);
  assert.ok(rest(6) < top - 0.9, "at the start the slope is well below the bounding-box top");
  const s = { ...createState(level([slab])), x: 6, y: rest(6), vy: 0, grounded: true };
  let previous = s.y;
  for (let i = 0; i < 60; i++) {
    step(s, false);
    assert.equal(s.status, "playing");
    assert.ok(s.y >= previous - 1e-9, "walking up the slope never drops");
    assert.ok(Math.abs(s.y - rest(s.x)) < 0.02, `tracks the real edge, not the box top: ${s.y} vs ${rest(s.x)} (box ${top})`);
    previous = s.y;
  }
  assert.equal(s.grounded, true, "still standing on the slope");
  assert.ok(s.y - rest(6) > 0.5, "climbed a real distance");
  // the same block's leading face is 70 degrees from the floor: that is a wall, and walking into it kills
  const w = { ...createState(level([slab])), x: 5, y: 0, vy: 0, grounded: true };
  for (let i = 0; i < 120 && w.status === "playing"; i++) step(w, false);
  assert.equal(w.status, "dead");
  assert.ok(SIZE < 1);
});
