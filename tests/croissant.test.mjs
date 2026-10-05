import test from 'node:test';
import assert from 'node:assert/strict';
import { createState, step, across, SIZE, object, validateLevel } from '../src/engine.ts';

// The croissant (#97): a tap on a surface teleports straight across to the surface on the other
// side and flips gravity. Midair taps do nothing, like the wheel.
const level = (objects) => ({ name: 'Croissant', length: 40, height: 7, objects });
const at = (objects, extra = {}) => ({ ...createState(level(objects)), mode: 'croissant', x: 5, ...extra });

test('a tap on the floor lands on the ceiling, upside down, in one frame', () => {
  const s = at([]);
  step(s, true);
  assert.equal(s.gravity, 1);
  assert.equal(s.y, 7 - SIZE, 'on the ceiling');
  assert.equal(s.grounded, true);
  for (let i = 0; i < 120; i++) step(s, false);
  assert.equal(s.status, 'playing'); assert.equal(s.y, 7 - SIZE, 'and it stays there');
  // and back down
  step(s, true);
  assert.equal(s.gravity, -1); assert.equal(s.y, 0); assert.equal(s.grounded, true);
});

test('it stops at the first block over it, under it, or a slope; spikes and rings do not stop it', () => {
  const roof = at([object('block', 5, 4), object('block', 5, 6)]);
  step(roof, true);
  assert.equal(roof.y, 4 - SIZE, 'the underside of the nearer block');
  const down = at([object('block', 5, 1), object('block', 5, 3)], { y: 7 - SIZE, gravity: 1 });
  step(down, true);
  assert.equal(down.y, 4, 'the top of the nearer block');
  // the teleport itself picks the nearer face, whatever order the pieces were placed in
  for (const order of [[4, 6], [6, 4]]) {
    assert.equal(across(at(order.map(y => object('block', 5, y)), { gravity: 1 })), 4 - SIZE);
    assert.equal(across(at(order.map(y => object('block', 5, y - 3)), { y: 7 - SIZE })), 4);
  }
  const ramp = at([{ ...object('ramp', 5, 5), flipY: true }]);
  step(ramp, true);
  assert.ok(ramp.y + SIZE <= 6.001 && ramp.y + SIZE > 5, `under the slope, y=${ramp.y}`);
  const passed = at([object('spike', 5, 3), object('ring', 5, 2), { ...object('block', 5, 4), noTouch: true }]);
  assert.equal(across({ ...passed, gravity: 1 }), 7 - SIZE, 'through to the ceiling');
  const hidden = at([{ ...object('block', 5, 4), hidden: true }]);
  step(hidden, true);
  assert.equal(hidden.y, 4 - SIZE, 'a hidden block is still there');
});

test('midair taps and held landings do nothing, a fresh tap on a block does', () => {
  const air = at([], { y: 2, grounded: false });
  step(air, true);
  assert.equal(air.gravity, -1, 'midair');
  for (let i = 0; i < 120; i++) step(air, true);
  assert.equal(air.y, 0); assert.equal(air.gravity, -1, 'held through the landing');
  const block = at([object('block', 5, 1)], { y: 2 });
  step(block, false);
  step(block, true);
  assert.equal(block.gravity, 1); assert.equal(block.y, 7 - SIZE);
});

test('the croissant portal sets the mode and validates', () => {
  const s = { ...createState(level([object('croissant', 5)])), x: 4.6 };
  step(s, false);
  assert.equal(s.mode, 'croissant');
  const ok = level([object('croissant', 5)]);
  assert.deepEqual(validateLevel(ok), ok);
});
