import test from 'node:test';
import assert from 'node:assert/strict';
import { createState, step, SIZE, STEP, TYPES, object, polygon, bounds, intersects, transform, validateLevel } from '../public/engine.js';
const empty = { name: 'Gravity checks', length: 100, objects: [] };

test('wheel requires surface contact, ignores midair taps, and never queues a held flip on landing', () => {
  const s = { ...createState(empty), mode: 'wheel' };
  for (let i = 0; i < 30; i++) step(s, true);
  assert.equal(s.gravity, 1); assert.ok(s.y > 0); assert.ok(s.vy > 0);
  step(s, false); step(s, true);
  assert.equal(s.gravity, 1); assert.ok(s.vy > 0);
  step(s, false, STEP, true); assert.equal(s.gravity, 1);
  step(s, true);
  for (let i = 0; i < 120; i++) step(s, true);
  assert.equal(s.gravity, 1); assert.equal(s.y, 7 - SIZE); assert.ok(s.grounded); assert.equal(s.status, 'playing');
  step(s, false); step(s, true); assert.equal(s.gravity, -1);
  for (let i = 0; i < 120; i++) step(s, true);
  assert.equal(s.gravity, -1); assert.equal(s.y, 0); assert.ok(s.grounded);
  assert.equal(createState(empty).gravity, -1);
  // A tap that begins and ends between physics frames still has an explicit input edge.
  step(s, false, STEP, true); assert.equal(s.gravity, 1);
});

test('wheel can flip from every block top, but not after rolling off its edge', () => {
  for (const type of ['block', 'grid', 'black']) {
    const s = { ...createState({ ...empty, objects: [object(type, 5, 2)] }), mode: 'wheel', x: 5, y: 3.01, vy: -2, grounded: false };
    step(s, false); assert.ok(s.grounded); step(s, true); assert.equal(s.gravity, 1);
    const edge = { ...createState(s.level), mode: 'wheel', x: 5.98, y: 3 };
    step(edge, false); assert.equal(edge.grounded, false);
    step(edge, true); assert.equal(edge.gravity, -1);
  }
});

test('upside-down square, plane and wheel physics mirror normal gravity', () => {
  for (const mode of ['square', 'plane', 'wheel']) {
    const a = { ...createState(empty), mode }, b = { ...createState(empty), mode, y: 7 - SIZE, gravity: 1 };
    for (let i = 0; i < 180; i++) {
      const held = mode === 'square' ? i < 10 : mode === 'plane' ? i < 60 : i < 5;
      step(a, held); step(b, held);
      assert.ok(Math.abs(a.y + b.y - (7 - SIZE)) < 1e-8, `${mode} tick ${i}`);
      assert.ok(Math.abs(a.vy + b.vy) < 1e-8); assert.equal(a.status, 'playing'); assert.equal(b.status, 'playing');
    }
  }
});

test('inverted square and wheel land on block undersides; square jumps away; sides still kill', () => {
  for (const type of ['block', 'grid', 'black']) for (const mode of ['square', 'wheel']) {
    const s = { ...createState({ ...empty, objects: [object(type, 5, 4), object(type, 6, 4)] }), mode, gravity: 1, x: 5, y: 4 - SIZE - .02, vy: 3, grounded: false };
    step(s, false); assert.equal(s.y, 4 - SIZE); assert.ok(s.grounded); assert.equal(s.status, 'playing');
    step(s, true); assert.ok(s.y < 4 - SIZE); assert.equal(s.grounded, false);
    const side = { ...createState({ ...empty, objects: [object(type, 5, 4)] }), mode, gravity: 1, x: 5 - SIZE, y: 4.1, grounded: false };
    step(side, false); assert.equal(side.status, 'dead');
  }
});

test('gravity portals set direction without changing mode, and overlapping portals fire only on entry', () => {
  for (const mode of ['square', 'plane', 'wheel']) for (const type of ['gravity-up', 'gravity-down']) {
    const s = { ...createState({ ...empty, objects: [object(type, 3)] }), mode, gravity: type === 'gravity-up' ? -1 : 1, x: 2.8, y: 1, grounded: false };
    step(s, false); assert.equal(s.mode, mode); assert.equal(s.gravity, type === 'gravity-up' ? 1 : -1);
  }
  const s = { ...createState({ ...empty, objects: [object('wheel', 3), object('gravity-up', 3)] }), x: 2.8, y: .5 };
  step(s, false); assert.equal(s.mode, 'wheel'); assert.equal(s.gravity, 1);
  for (let i = 0; i < 8; i++) step(s, false);
  assert.ok(s.vy > .9, 'remaining inside overlapping portals must not reset velocity each tick');
  const inverted = { ...createState({ ...empty, objects: [object('plane', 3)] }), x: 2.8, y: 1, gravity: 1, grounded: false };
  step(inverted, false); assert.equal(inverted.mode, 'plane'); assert.equal(inverted.gravity, 1); assert.ok(inverted.vy < 0);
});

test('all new objects validate and transform; two-thirds spike is two-thirds in both dimensions', () => {
  for (const type of TYPES) {
    const o = object(type, 6, 2);
    for (let i = 0; i < 4; i++) { transform(o, 'cw'); transform(o, 'flipY'); validateLevel({ ...empty, objects: [o] }); }
  }
  const spike = object('small', 6, 2), b = bounds(spike);
  assert.ok(Math.abs(b.right - b.left - 2 / 3) < 1e-9); assert.ok(Math.abs(b.top - b.bottom - 2 / 3) < 1e-9);
  const above = [[6.28, 2.7], [6.38, 2.7], [6.38, 2.8], [6.28, 2.8]];
  assert.equal(intersects(above, polygon(spike)), false);
  const inside = [[6.28, 2.3], [6.38, 2.3], [6.38, 2.4], [6.28, 2.4]];
  assert.equal(intersects(inside, polygon(spike)), true);
});
