import test from 'node:test';
import assert from 'node:assert/strict';
import { pinchStart, pinchTransform, SNAP_ANGLE, SNAP_SCALE } from '../src/gesture.ts';

const both = (k, rotation) => ({ scaleX: k, scaleY: k, rotation });

test('spreading the fingers grows the piece, turning them turns it, snap rounds both', () => {
  const p = pinchStart([100, 100], [200, 100], 1, 0);
  // twice the distance: scale 2, no turn
  assert.deepEqual(pinchTransform(p, [50, 100], [250, 100], true, true), both(2, 0));
  // half the distance: 0.5
  assert.deepEqual(pinchTransform(p, [125, 100], [175, 100], true, true), both(0.5, 0));
  // second finger swung to straight below the first on screen: a quarter turn clockwise on
  // screen, which is 270 in the editor's anticlockwise degrees
  assert.deepEqual(pinchTransform(p, [100, 100], [100, 200], true, true), both(1, 270));
  // and straight above: 90
  assert.deepEqual(pinchTransform(p, [100, 100], [100, 0], true, true), both(1, 90));
  // a 40 degree turn snaps to 45 with snap on, stays 40 with it off
  const turned = [100 + 100 * Math.cos(-40 * Math.PI / 180), 100 + 100 * Math.sin(-40 * Math.PI / 180)];
  assert.equal(pinchTransform(p, [100, 100], turned, true, true).rotation, 45);
  assert.equal(pinchTransform(p, [100, 100], turned, false, true).rotation, 40);
  // scale 1.3x snaps to 1.25, off snaps to the slider's 0.05
  assert.equal(pinchTransform(p, [100, 100], [230, 100], true, true).scaleX, 1.25);
  assert.equal(pinchTransform(p, [100, 100], [231, 100], false, true).scaleX, 1.3);
  assert.equal(SNAP_ANGLE, 15); assert.equal(SNAP_SCALE, 0.25);
});

test('the pinch starts from the piece as it is, clamps to the size bounds, and quarter-turns unscalable pieces', () => {
  const p = pinchStart([0, 0], [100, 0], 2, 30);
  assert.deepEqual(pinchTransform(p, [0, 0], [100, 0], false, true), both(2, 30));
  assert.equal(pinchTransform(p, [0, 0], [1000, 0], true, true).scaleX, 4);
  assert.equal(pinchTransform(p, [0, 0], [1, 0], true, true).scaleX, 0.25);
  // a trigger: no size, rotation only in quarter turns
  const q = pinchStart([0, 0], [100, 0], 1, 0);
  assert.deepEqual(pinchTransform(q, [0, 0], [300, 0], false, false), both(1, 0));
  assert.deepEqual(pinchTransform(q, [0, 0], [0, 100], false, false), both(1, 270));
  const nudge = [100 * Math.cos(-20 * Math.PI / 180), 100 * Math.sin(-20 * Math.PI / 180)];
  assert.equal(pinchTransform(q, [0, 0], nudge, false, false).rotation, 0, 'twenty degrees is not yet a quarter turn');
  // #106: a ring or portal takes a size from the pinch but still turns only in quarter turns
  assert.deepEqual(pinchTransform(q, [0, 0], nudge.map((v) => v * 3), false, true, false), both(3, 0));
  assert.deepEqual(pinchTransform(q, [0, 0], [0, 200], true, true, false), both(2, 270));
  // fingers on the same point never divide by zero
  const z = pinchStart([5, 5], [5, 5], 1, 0);
  assert.ok(Number.isFinite(pinchTransform(z, [5, 5], [50, 5], true, true).scaleX));
});

test('a pinch scales width and height by one factor, so the shape is kept, and holds the factor at both bounds (#117)', () => {
  const p = pinchStart([0, 0], [100, 0], [2, 0.5], 0);
  // 1.2 times: 2 by 0.5 becomes 2.4 by 0.6, not 2.4 by 2.4
  assert.deepEqual(pinchTransform(p, [0, 0], [120, 0], false, true), { scaleX: 2.4, scaleY: 0.6, rotation: 0 });
  // growing stops when the wide axis reaches 4, so the narrow one stops at 1, not at 4
  assert.deepEqual(pinchTransform(p, [0, 0], [1000, 0], false, true), { scaleX: 4, scaleY: 1, rotation: 0 });
  // shrinking stops when the narrow axis reaches 0.25, so the wide one stops at 1
  assert.deepEqual(pinchTransform(p, [0, 0], [1, 0], false, true), { scaleX: 1, scaleY: 0.25, rotation: 0 });
  // snap: the larger axis lands on a quarter, the other follows by the same factor
  assert.deepEqual(pinchTransform(p, [0, 0], [113, 0], true, true), { scaleX: 2.25, scaleY: 0.55, rotation: 0 });
});
