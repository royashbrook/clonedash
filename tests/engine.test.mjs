import test from 'node:test';
import assert from 'node:assert/strict';
import { createState, step, STEP, SPEED, SIZE, PORTALS, SPIKES, polygon, intersects, bounds, object, transform, validateLevel } from '../public/engine.js';
import { LEVELS } from '../public/levels.js';
const empty = { name: 'Test', length: 100, objects: [] };
test('auto-run is 5 blocks/sec; jump clears two blocks with a quarter-block margin', () => {
  const s = createState(empty); step(s, true); let peak = s.y;
  for (let i = 1; i < 120; i++) { step(s, false); peak = Math.max(peak, s.y); }
  assert.equal(SPEED, 5); assert.ok(Math.abs(s.x - 1 - 5) < 1e-9); assert.ok(Math.abs(peak - 2.25) < .001);
  for (let i = 0; i < 20; i++) step(s, false);
  assert.equal(s.y, 0);
});
test('two-block ledges can be landed on across a useful jump timing window', () => {
  for (const launch of [1.9, 2.1, 2.3, 2.5]) {
    const s = createState({ ...empty, objects: [object('block', 5), object('grid', 5, 1), object('grid', 6, 1), object('grid', 7, 1)] });
    let landed = false;
    while (s.x < 8 && s.status === 'playing') {
      step(s, s.grounded && s.y === 0 && s.x >= launch);
      if (s.grounded && s.y === 2) landed = true;
    }
    assert.equal(s.status, 'playing', `launch ${launch}`); assert.ok(landed, `launch ${launch}`);
  }
});
test('planes retain safe solid top and underside contact; spikes still kill', () => {
  for (const type of ['block', 'grid', 'black', 'outline']) for (const rotation of [0, 90, 180, 270]) {
    const block = { ...object(type, 5, 2), rotation };
    for (const [y, vy, held] of [[3.01, -2, false], [2 - SIZE - .01, 2, true]]) {
      const s = { ...createState({ ...empty, objects: [block] }), mode: 'plane', x: 5, y, vy, grounded: false };
      for (let i = 0; i < 6; i++) step(s, held);
      assert.equal(s.status, 'playing');
      assert.ok(!intersects([[s.x,s.y],[s.x+SIZE,s.y],[s.x+SIZE,s.y+SIZE],[s.x,s.y+SIZE]], polygon(block)));
      for (let i = 0; i < 180; i++) step(s, true);
      assert.equal(s.status, 'playing'); assert.ok(s.x > 6, 'plane escapes contact');
    }
  }
  const floor = { ...createState(empty), mode: 'plane' };
  step(floor, false); assert.equal(floor.status, 'playing'); step(floor, true); assert.ok(floor.y > 0);
  for (const type of SPIKES) {
    const s = { ...createState({ ...empty, objects: [object(type, 3)] }), mode: 'plane' };
    for (let i = 0; i < 90; i++) step(s, false);
    assert.equal(s.status, 'dead');
  }
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
  const s = createState({ ...empty, objects: [object('block', 3), object('grid', 4), object('grid', 5)] });
  let landed = false;
  while (s.x < 6 && s.status === 'playing') { step(s, s.grounded && s.x < 1.1); if (s.grounded && s.y === 1) landed = true; }
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
  if (s.mode === 'jumper') return [5.5, 7.5, 16.5, 26].some(x => s.x >= x && s.x < x + SPEED * STEP);
  if (s.mode === 'wheel') return s.grounded && s.gravity < 0 && s.level.objects.some(o => SPIKES.includes(o.type) && o.x - s.x > 1 && o.x - s.x < 2);
  if (s.mode === 'plane') return s.y + s.vy * .3 < 2.55;
  if (!s.grounded) return false;
  return s.level.objects.some(o => {
    if (PORTALS.includes(o.type)) return false;
    const b = bounds(o);
    const lead = SPIKES.includes(o.type) ? 1.1 : 2.1;
    return b.top > s.y + .05 && b.bottom < s.y + 1.1 && b.left - s.x > lead - .5 && b.left - s.x < lead;
  });
}
for (const [i, level] of LEVELS.entries()) test(`completion witness ${i + 1}: ${level.name}`, () => {
  const s = createState(level);
  for (let tick = 0; tick < 6000 && s.status === 'playing'; tick++) step(s, inputFor(s), STEP);
  assert.equal(s.status, 'complete', `stopped at x=${s.x.toFixed(2)} y=${s.y.toFixed(2)} mode=${s.mode}`);
});
