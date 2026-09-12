import test from 'node:test';
import assert from 'node:assert/strict';
import { createState, step, object, polygon, RAMPS, SIZE, JUMP, GRAVITY, STEP, ringReady, rampSurface, validateLevel, duplicateObject } from '../public/engine.js';
const empty = { name: 'Ramps', length: 40, objects: [] };

test('ring needs a fresh nearby tap, respects gravity, grants one boost and resets per run', () => {
  for (const gravity of [-1, 1]) {
    const ring = object('ring', 5, 3), level = { ...empty, objects: [ring] };
    const s = { ...createState(level), x: 5, y: 3, gravity, grounded: false, vy: gravity };
    step(s, false); assert.deepEqual(s.usedRings, []);
    step(s, true); assert.equal(s.vy, -gravity * (JUMP - GRAVITY * STEP)); assert.deepEqual(s.usedRings, [0]);
    step(s, false); const v = s.vy; step(s, true); assert.equal(s.vy, v + gravity * GRAVITY * STEP);
    assert.equal(ringReady(createState(level), ring, 0), false);
    const far = { ...createState(level), y: 3, grounded: false }; step(far, true); assert.deepEqual(far.usedRings, []); assert.ok(far.vy < 0);
    const held = { ...createState(level), x: 5, y: 3, grounded: false, inputHeld: true }; step(held, true); assert.deepEqual(held.usedRings, []);
    assert.deepEqual(createState(level).usedRings, []);
  }
});

test('all ramp transforms preserve a 45-degree slope and match triangular support geometry', () => {
  for (const type of RAMPS) for (const rotation of [0, 90, 180, 270]) for (const flipX of [false, true]) for (const flipY of [false, true]) {
    const o = { ...object(type, 5, 2), rotation, flipX, flipY }, p = polygon(o);
    assert.equal(p.length, 3); assert.equal(Math.abs(p[2][0] - p[0][0]), 1); assert.equal(Math.abs(p[2][1] - p[0][1]), 1);
    const top = rampSurface(o, 5.49, 5.51, true), bottom = rampSurface(o, 5.49, 5.51, false);
    assert.ok(top > bottom); assert.ok(top <= 3 && bottom >= 2);
    assert.doesNotThrow(() => validateLevel({ ...empty, objects: [o] }));
    assert.equal(duplicateObject({ ...empty, objects: [o] }, 0).x, 6);
  }
});

test('square and wheel climb and descend connected slopes without hopping or dying, also inverted', () => {
  for (const type of RAMPS) for (const mode of ['square', 'wheel', 'jumper', 'plane']) for (const inverted of [false, true]) {
    let objects = [object(type, 5), object('plain-black', 6), { ...object(type, 7), flipX: true }];
    if (inverted) objects = objects.map(o => ({ ...o, y: 6 - o.y, flipY: !o.flipY }));
    const s = { ...createState({ ...empty, objects }), mode, gravity: inverted ? 1 : -1, y: inverted ? 7 - SIZE : 0 };
    let high = false, slopeFrames = 0, previous = s.y;
    while (s.x < 9 && s.status === 'playing') {
      step(s, false);
      const height = inverted ? 7 - SIZE - s.y : s.y;
      if (height > .1 && height < .9) { slopeFrames++; assert.equal(s.grounded, true); }
      if (height > .99) high = true;
      assert.ok(Math.abs(s.y - previous) < .06, 'continuous slope contact'); previous = s.y;
    }
    assert.equal(s.status, 'playing', `${type} ${mode} inverted=${inverted} x=${s.x} y=${s.y}`);
    assert.ok(high && slopeFrames > 10); assert.ok(Math.abs(s.y - (inverted ? 7 - SIZE : 0)) < .001);
  }
});

test('jumping off a ramp releases its surface and its high vertical side is not a staircase', () => {
  const s = createState({ ...empty, objects: [object('ramp', 5)] });
  while (s.x < 5) step(s, false);
  const height = s.y; step(s, true); assert.ok(s.y > height); assert.equal(s.grounded, false);
  const side = createState({ ...empty, objects: [{ ...object('ramp', 5), flipX: true }] });
  for (let i = 0; i < 200; i++) step(side, false);
  assert.equal(side.status, 'dead');
});

test('planes and jumpers retain safe ramp wall and underside contact', () => {
  for (const mode of ['plane', 'jumper']) for (const type of RAMPS) {
    const wall = { ...object(type, 5, 2), flipX: true };
    const s = { ...createState({ ...empty, objects: [wall] }), mode, x: 5 - SIZE, y: 2.1, grounded: false };
    step(s, false); assert.equal(s.status, 'playing'); assert.equal(s.x, 5 - SIZE);
    const underside = { ...createState({ ...empty, objects: [object(type, 5, 2)] }), mode, x: 5.2, y: 2 - SIZE - .01, vy: 2, grounded: false };
    step(underside, false); assert.equal(underside.status, 'playing'); assert.equal(underside.y, 2 - SIZE);
  }
});
