import test from 'node:test';
import assert from 'node:assert/strict';
import { createState, step, STEP, SPEED, SIZE, PORTALS, TYPES, object, validateLevel } from '../src/engine.ts';
const empty = { name: 'Angle', length: 100, height: 10, objects: [] };
const angle = (extra = {}) => ({ ...createState(empty), mode: 'angle', x: 5, y: 4, vy: 0, grounded: false, ...extra });

test('angle climbs at exactly 45 degrees while held and dives at 45 when released, gravity ignored', () => {
  const s = angle();
  for (let i = 0; i < 30; i++) { const x = s.x, y = s.y; step(s, true); assert.ok(Math.abs((s.y - y) - (s.x - x)) < 1e-9, `climb tick ${i}`); }
  assert.equal(s.vy, SPEED);
  for (let i = 0; i < 30; i++) { const x = s.x, y = s.y; step(s, false); assert.ok(Math.abs((y - s.y) - (s.x - x)) < 1e-9, `dive tick ${i}`); }
  assert.equal(s.vy, -SPEED);
  assert.ok(Math.abs(s.y - 4) < 1e-9, 'a climb and an equal dive return to the start height');
});

test('inverted gravity mirrors the angle: holding heads for the floor', () => {
  const a = angle(), b = angle({ gravity: 1, y: 10 - SIZE - 4 });
  for (let i = 0; i < 120; i++) {
    const held = i % 40 < 20;
    step(a, held); step(b, held);
    assert.ok(Math.abs(a.y + b.y - (10 - SIZE)) < 1e-8, `tick ${i}`);
    assert.ok(Math.abs(a.vy + b.vy) < 1e-8);
  }
});

test('floor and ceiling are safe slides in angle mode; block tops and undersides too; walls kill', () => {
  const floor = angle({ y: 0.2 });
  for (let i = 0; i < 200; i++) step(floor, false);
  assert.equal(floor.status, 'playing'); assert.equal(floor.y, 0);
  const ceiling = angle();
  for (let i = 0; i < 400; i++) step(ceiling, true);
  assert.equal(ceiling.status, 'playing'); assert.equal(ceiling.y, 10 - SIZE);
  const top = { ...angle({ x: 5, y: 3.05 }), level: { ...empty, objects: [object('block', 5, 2), object('block', 6, 2)] } };
  for (let i = 0; i < 20; i++) step(top, false);
  assert.equal(top.status, 'playing'); assert.equal(top.y, 3, 'rides the top face');
  const under = { ...angle({ x: 5, y: 2 - SIZE - 0.05 }), level: top.level };
  for (let i = 0; i < 20; i++) step(under, true);
  assert.equal(under.status, 'playing'); assert.equal(under.y, 2 - SIZE, 'rides the underside');
  const wall = { ...angle({ x: 5 - SIZE - 0.2, y: 2.3 }), level: { ...empty, objects: [object('block', 5, 2)] } };
  for (let i = 0; i < 12; i++) step(wall, false);
  assert.equal(wall.status, 'dead');
});

test('the angle portal switches mode, is a portal for placement and validation, and keeps gravity', () => {
  assert.ok(PORTALS.includes('angle')); assert.ok(TYPES.includes('angle'));
  for (const gravity of [-1, 1]) {
    const s = { ...createState({ ...empty, objects: [object('angle', 3, 2)] }), x: 2.5, y: 3, gravity, grounded: false };
    step(s, false); assert.equal(s.mode, 'angle'); assert.equal(s.gravity, gravity);
    step(s, true); assert.equal(s.vy, -gravity * SPEED);
  }
  assert.doesNotThrow(() => validateLevel({ ...empty, objects: [object('angle', 10, 1)] }));
  assert.throws(() => validateLevel({ ...empty, objects: [{ ...object('angle', 10, 1), rotation: 45 }] }), /Invalid object/);
  assert.throws(() => validateLevel({ ...empty, objects: [{ ...object('angle', 10, 1), scale: 2 }] }), /Invalid scale/);
});
