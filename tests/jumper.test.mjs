import test from 'node:test';
import assert from 'node:assert/strict';
import { createState, step, STEP, JUMP, GRAVITY, SIZE, object, polygon, bounds, transform, validateLevel } from '../public/engine.js';
const empty = { name: 'Jumper test', length: 100, objects: [] };

test('jumper matches square on the ground, but fresh midair taps restart its jump', () => {
  const square = createState(empty), jumper = { ...createState(empty), mode: 'jumper' };
  for (let i = 0; i < 45; i++) { step(square, true); step(jumper, true); assert.equal(jumper.y, square.y); }
  const oldVelocity = jumper.vy;
  step(jumper, true); assert.ok(jumper.vy < oldVelocity, 'holding never boosts in air');
  step(square, false); step(jumper, false);
  step(square, true); step(jumper, true);
  assert.ok(square.vy < 3); assert.equal(jumper.vy, JUMP - GRAVITY * STEP);
  step(jumper, false); step(jumper, true);
  assert.equal(jumper.vy, JUMP - GRAVITY * STEP, 'not limited to one extra jump');
});

test('jumper air jumps mirror under inverted gravity, including released short taps', () => {
  for (const gravity of [-1, 1]) {
    const s = { ...createState(empty), mode: 'jumper', gravity, y: 3, vy: gravity * 2, grounded: false };
    step(s, false, STEP, true);
    assert.equal(s.vy, -gravity * (JUMP - GRAVITY * STEP));
    const v = s.vy; step(s, false); assert.equal(s.vy, v + gravity * GRAVITY * STEP);
  }
});

test('jumper and square portals preserve gravity and switch air-jump ability', () => {
  for (const gravity of [-1, 1]) {
    const s = { ...createState({ ...empty, objects: [object('jumper', 3, 2), object('square', 5, 2)] }), x: 2.5, y: 3, grounded: false, gravity };
    step(s, false); assert.equal(s.mode, 'jumper'); assert.equal(s.gravity, gravity);
    s.x = 4.5; s.y = 3; step(s, false); assert.equal(s.mode, 'square'); assert.equal(s.gravity, gravity);
    const before = s.vy; step(s, true); assert.equal(s.vy, before + gravity * GRAVITY * STEP);
  }
});

test('outline blocks are solid: support jumper on either gravity face and kill side contact', () => {
  const level = { ...empty, objects: [object('outline', 5, 2)] };
  for (const gravity of [-1, 1]) {
    const s = { ...createState(level), mode: 'jumper', gravity, x: 5, y: gravity < 0 ? 3.01 : 2 - SIZE - .01, vy: gravity * 2, grounded: false };
    step(s, false); assert.equal(s.status, 'playing'); assert.equal(s.grounded, true);
    assert.equal(s.y, gravity < 0 ? 3 : 2 - SIZE);
  }
  const side = { ...createState(level), mode: 'jumper', x: 5 - SIZE, y: 2.1, grounded: false };
  step(side, false); assert.equal(side.status, 'dead');
});

test('quarter spike geometry, transforms, save validation and lethal collision agree', () => {
  for (const rotation of [0, 90, 180, 270]) for (const flipY of [false, true]) {
    const spike = { ...object('quarter', 5, 2), rotation, flipY }, b = bounds(spike);
    assert.equal(b.right - b.left, .25); assert.equal(b.top - b.bottom, .25);
    assert.equal(polygon(spike).length, 3);
    const s = { ...createState({ ...empty, objects: [spike] }), mode: 'jumper', x: 4.8, y: 2, grounded: false };
    step(s, false); assert.equal(s.status, 'dead');
    transform(spike, 'right', .05); assert.equal(spike.x, 5.05);
    assert.doesNotThrow(() => validateLevel({ ...empty, objects: [spike, object('outline', 8), object('jumper', 10)] }));
  }
});
