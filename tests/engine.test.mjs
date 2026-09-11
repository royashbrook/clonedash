import test from 'node:test';
import assert from 'node:assert/strict';
import { createState, step, STEP, SPEED, polygon, intersects, bounds, object, transform, validateLevel } from '../public/engine.js';
import { LEVELS } from '../public/levels.js';
const empty = { name: 'Test', length: 100, objects: [] };
test('auto-run is 2.5 blocks/sec; analytical jump apex is exactly 2 blocks', () => {
  const s = createState(empty); step(s, true); let peak = s.y;
  for (let i = 1; i < 120; i++) { step(s, false); peak = Math.max(peak, s.y); }
  assert.ok(Math.abs(s.x - 1 - SPEED) < 1e-9); assert.ok(Math.abs(peak - 2) < 1e-9); assert.equal(s.y, 0);
});
test('plane input changes acceleration; both portals work', () => {
  const level = { ...empty, objects: [object('plane', 3), object('square', 4)] };
  const s = createState(level);
  while (s.x < 2.5) step(s, false);
  assert.equal(s.mode, 'plane'); const v = s.vy; step(s, true); assert.ok(s.vy > v); const high = s.vy; step(s, false); assert.ok(s.vy < high);
  while (s.x < 4 && s.status === 'playing') step(s, s.y < 1);
  assert.equal(s.mode, 'square');
});
test('spikes kill, block sides kill, block tops support; paused terminal states never advance', () => {
  for (const type of ['spike', 'half', 'block', 'grid']) {
    const s = createState({ ...empty, objects: [object(type, 3)] });
    for (let i = 0; i < 200; i++) step(s, false);
    assert.equal(s.status, 'dead', type); const snapshot = JSON.stringify(s); step(s, true); assert.equal(JSON.stringify(s), snapshot);
  }
  const s = createState({ ...empty, objects: [object('block', 3), object('grid', 4)] });
  let landed = false;
  while (s.x < 5 && s.status === 'playing') { step(s, s.grounded && s.x > 1.7 && s.x < 2); if (s.grounded && s.y === 1) landed = true; }
  assert.equal(s.status, 'playing'); assert.ok(landed);
});
test('editor precise nudges, both rotations, flips and collision geometry agree', () => {
  const o = object('half', 6, 2), p = polygon(o);
  transform(o, 'right', .05); assert.equal(o.x, 6.05); transform(o, 'left', .05); assert.equal(o.x, 6);
  transform(o, 'up', .5); transform(o, 'down', .5); assert.equal(o.y, 2);
  transform(o, 'cw'); assert.equal(o.rotation, 270); assert.equal(bounds(o).right - bounds(o).left, .5);
  transform(o, 'ccw'); assert.deepEqual(polygon(o), p);
  transform(o, 'flipY'); assert.notDeepEqual(polygon(o), p);
  const tipBox = [[6.45, 2.02], [6.55, 2.02], [6.55, 2.12], [6.45, 2.12]];
  assert.ok(intersects(tipBox, polygon(o)));
  transform(o, 'flipY'); transform(o, 'flipX'); transform(o, 'flipX'); assert.deepEqual(polygon(o), p);
});
test('invalid drafts are refused, authored levels validate', () => {
  for (const l of LEVELS) assert.deepEqual(validateLevel(l), l);
  for (const bad of [null, { ...empty, length: NaN }, { ...empty, objects: [object('bad', 5)] }, { ...empty, objects: [object('spike', 0)] }, { ...empty, objects: [{ ...object('grid', 5), rotation: 45 }] }]) assert.throws(() => validateLevel(bad));
});
// This controller supplies only the same held/not-held input as a player. It cannot teleport,
// change physics or remove objects. Every authored trail must reach its actual finish alive.
export function inputFor(s) {
  if (s.mode === 'plane') return s.y + s.vy * .3 < 2.55;
  if (!s.grounded) return false;
  return s.level.objects.some(o => {
    if (['plane', 'square'].includes(o.type)) return false;
    const b = bounds(o);
    return b.top > s.y + .05 && b.bottom < s.y + 1.1 && b.left - s.x > .7 && b.left - s.x < 1.15;
  });
}
for (const [i, level] of LEVELS.entries()) test(`completion witness ${i + 1}: ${level.name}`, () => {
  const s = createState(level);
  for (let tick = 0; tick < 6000 && s.status === 'playing'; tick++) step(s, inputFor(s), STEP);
  assert.equal(s.status, 'complete', `stopped at x=${s.x.toFixed(2)} y=${s.y.toFixed(2)} mode=${s.mode}`);
});
