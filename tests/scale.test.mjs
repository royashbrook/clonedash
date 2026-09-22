import { test } from "node:test";
import assert from "node:assert/strict";
import {
  object,
  polygon,
  bounds,
  createState,
  step,
  validateLevel,
  SCALABLE,
  SIZE,
} from "../src/engine.ts";
import { encodeLevel, decodeLevel } from "../src/transfer.ts";

const level = (objects) => ({ name: "Scale test", length: 40, objects });

test("a scaled piece grows from its base, sideways about its centre; absent and 1 are the same shape", () => {
  const block = object("block", 5, 2);
  assert.deepEqual(polygon({ ...block, scale: 1 }), polygon(block));
  const b = bounds({ ...block, scale: 2 });
  assert.deepEqual(b, { left: 4.5, right: 6.5, bottom: 2, top: 4 });
  const spike = bounds({ ...object("spike", 5, 2), scale: 0.5 });
  assert.deepEqual(spike, { left: 5.25, right: 5.75, bottom: 2, top: 2.5 });
  const ramp = bounds({ ...object("ramp", 5, 2), scale: 3 });
  assert.deepEqual(ramp, { left: 4, right: 7, bottom: 2, top: 5 });
  // a ceiling spike (rotated 180) keeps its base on the ceiling and grows downward
  const ceiling = bounds({ ...object("spike", 5, 6), rotation: 180, scale: 2 });
  assert.equal(ceiling.top, 7);
  assert.equal(ceiling.bottom, 5);
  // rings and portals ignore a scale entirely
  for (const type of ["ring", "plane"]) {
    const o = object(type, 5, 2);
    assert.deepEqual(polygon({ ...o, scale: 3 }), polygon(o));
  }
  // rotation and flips still apply to the scaled shape
  const rotated = bounds({ ...object("half", 5, 2), scale: 2, rotation: 90 });
  assert.equal(+(rotated.right - rotated.left).toFixed(6), 1);
  assert.equal(+(rotated.top - rotated.bottom).toFixed(6), 2);
});

test("scale is validated: 0.25 to 4, blocks/spikes/ramps only; the exporter keeps it", async () => {
  const ok = level([{ ...object("grid", 10, 1), scale: 2.5 }]);
  assert.deepEqual(validateLevel(ok), ok);
  for (const bad of [0.2, 4.01, NaN, Infinity, "2"]) {
    assert.throws(() => validateLevel(level([{ ...object("block", 10, 1), scale: bad }])), /Invalid scale/);
  }
  assert.throws(() => validateLevel(level([{ ...object("ring", 10, 1), scale: 2 }])), /Invalid scale/);
  assert.throws(() => validateLevel(level([{ ...object("plane", 10, 1), scale: 2 }])), /Invalid scale/);
  assert.deepEqual([...SCALABLE].sort(), ["black", "block", "grid", "half", "outline", "plain-black", "quarter", "ramp", "ramp-black", "ramp-grid", "small", "spike"].sort());
  // share code round trip
  const code = await encodeLevel(ok);
  assert.deepEqual((await decodeLevel(code)).objects[0].scale, 2.5);
  const plain = await decodeLevel(await encodeLevel(level([object("block", 10, 1)])));
  assert.equal("scale" in plain.objects[0], false, "no scale field is exported for an unscaled piece");
});

test("a big scaled block supports the player past the old 2-cell broad-phase window", () => {
  // a 4x block anchored at x=8 grows from its base: it spans 6.5..10.5 and its top is at 4.
  // standing near its right end puts the player more than 2 cells from the anchor, which the
  // old cull skipped: the player would fall through the block's trailing edge.
  const slab = { ...object("block", 8, 0), scale: 4 };
  assert.equal(bounds(slab).top, 4);
  const s = { ...createState(level([slab])), x: 10.2, y: 4, vy: 0, grounded: true };
  for (let i = 0; i < 4; i++) step(s, false);
  assert.ok(s.x < 10.5 && s.x - 8 > 2, "left edge still over the slab, more than 2 cells from the anchor");
  assert.equal(s.y, 4, "supported by the scaled block's real top");
  assert.equal(s.grounded, true);
  assert.equal(s.status, "playing");
  // the same anchor at scale 1 spans 8..9: at x=10.2 there is nothing under the player
  const s1 = { ...createState(level([object("block", 8, 0)])), x: 10.2, y: 4, vy: 0, grounded: true };
  for (let i = 0; i < 4; i++) step(s1, false);
  assert.ok(s1.y < 4, "falls, so the support above really came from the scale");
});
