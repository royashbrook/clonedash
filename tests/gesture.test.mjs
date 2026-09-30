import test from 'node:test';
import assert from 'node:assert/strict';
import { pinchStart, pinchTransform, SNAP_ANGLE, SNAP_SCALE } from '../src/gesture.ts';

test('spreading the fingers grows the piece, turning them turns it, snap rounds both', () => {
  const p = pinchStart([100, 100], [200, 100], 1, 0);
  // twice the distance: scale 2, no turn
  assert.deepEqual(pinchTransform(p, [50, 100], [250, 100], true, true), { scale: 2, rotation: 0 });
  // half the distance: 0.5
  assert.deepEqual(pinchTransform(p, [125, 100], [175, 100], true, true), { scale: 0.5, rotation: 0 });
  // second finger swung to straight below the first on screen: a quarter turn clockwise on
  // screen, which is 270 in the editor's anticlockwise degrees
  assert.deepEqual(pinchTransform(p, [100, 100], [100, 200], true, true), { scale: 1, rotation: 270 });
  // and straight above: 90
  assert.deepEqual(pinchTransform(p, [100, 100], [100, 0], true, true), { scale: 1, rotation: 90 });
  // a 40 degree turn snaps to 45 with snap on, stays 40 with it off
  const turned = [100 + 100 * Math.cos(-40 * Math.PI / 180), 100 + 100 * Math.sin(-40 * Math.PI / 180)];
  assert.equal(pinchTransform(p, [100, 100], turned, true, true).rotation, 45);
  assert.equal(pinchTransform(p, [100, 100], turned, false, true).rotation, 40);
  // scale 1.3x snaps to 1.25, off snaps to the slider's 0.05
  assert.equal(pinchTransform(p, [100, 100], [230, 100], true, true).scale, 1.25);
  assert.equal(pinchTransform(p, [100, 100], [231, 100], false, true).scale, 1.3);
  assert.equal(SNAP_ANGLE, 15); assert.equal(SNAP_SCALE, 0.25);
});

test('the pinch starts from the piece as it is, clamps to the size bounds, and quarter-turns unscalable pieces', () => {
  const p = pinchStart([0, 0], [100, 0], 2, 30);
  assert.deepEqual(pinchTransform(p, [0, 0], [100, 0], false, true), { scale: 2, rotation: 30 });
  assert.equal(pinchTransform(p, [0, 0], [1000, 0], true, true).scale, 4);
  assert.equal(pinchTransform(p, [0, 0], [1, 0], true, true).scale, 0.25);
  // a ring or portal: no scale, rotation only in quarter turns
  const q = pinchStart([0, 0], [100, 0], 1, 0);
  assert.deepEqual(pinchTransform(q, [0, 0], [300, 0], false, false), { scale: 1, rotation: 0 });
  assert.deepEqual(pinchTransform(q, [0, 0], [0, 100], false, false), { scale: 1, rotation: 270 });
  const nudge = [100 * Math.cos(-20 * Math.PI / 180), 100 * Math.sin(-20 * Math.PI / 180)];
  assert.equal(pinchTransform(q, [0, 0], nudge, false, false).rotation, 0, 'twenty degrees is not yet a quarter turn');
  // fingers on the same point never divide by zero
  const z = pinchStart([5, 5], [5, 5], 1, 0);
  assert.ok(Number.isFinite(pinchTransform(z, [5, 5], [50, 5], true, true).scale));
});
