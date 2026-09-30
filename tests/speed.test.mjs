import test from 'node:test';
import assert from 'node:assert/strict';
import { createState, step, STEP, SPEED, SPEEDS, PORTALS, TYPES, object, validateLevel } from '../src/engine.ts';
import { encodeLevel, decodeLevel } from '../src/transfer.ts';
const empty = { name: 'Speed', length: 200, height: 10, objects: [] };
const run = (objects, mode = 'square', gravity = -1) => ({ ...createState({ ...empty, objects }), mode, gravity });

test('a fresh run is 1x, and a level with no speed portal moves exactly as it always did', () => {
  const s = run([]);
  assert.equal(s.speed, 1);
  for (let i = 0; i < 120; i++) step(s, false);
  assert.ok(Math.abs(s.x - (1 + SPEED)) < 1e-9, 'one second at SPEED');
});

test('each speed portal sets forward speed and keeps mode and gravity', () => {
  for (const [type, k] of Object.entries(SPEEDS))
    for (const mode of ['square', 'plane', 'wheel', 'pogo', 'angle'])
      for (const gravity of [-1, 1]) {
        const s = { ...run([object(type, 3, gravity < 0 ? 0 : 7)], mode, gravity), x: 2.5, y: gravity < 0 ? 0 : 10 - 0.64 };
        step(s, false);
        assert.equal(s.speed, k, `${type} sets ${k}`);
        assert.equal(s.mode, mode); assert.equal(s.gravity, gravity);
        const x = s.x; step(s, false);
        assert.ok(Math.abs(s.x - x - SPEED * k * STEP) < 1e-12, `${type} ${mode} moves at ${k}x`);
      }
});

test('speeds change in either direction, last portal wins, and a retry starts at 1x again', () => {
  const s = { ...run([object('speed-faster', 3, 0), object('speed-slow', 8, 0)]), x: 2.5 };
  while (s.x < 6) step(s, false);
  assert.equal(s.speed, 1.5);
  while (s.x < 10) step(s, false);
  assert.equal(s.speed, 0.8);
  assert.equal(createState(s.level).speed, 1);
});

test('angle stays a true 45 degrees at every speed', () => {
  for (const k of Object.values(SPEEDS)) {
    const s = { ...run([], 'angle'), speed: k, x: 5, y: 4, grounded: false };
    for (let i = 0; i < 30; i++) { const x = s.x, y = s.y; step(s, true); assert.ok(Math.abs((s.y - y) - (s.x - x)) < 1e-9, `${k}x climb`); }
  }
});

test('a faster run still jumps the same arc: height is unchanged, reach grows', () => {
  const peak = (k) => {
    const s = { ...run([]), speed: k };
    let top = 0;
    step(s, true);
    for (let i = 0; i < 240 && s.y >= 0; i++) { step(s, false); top = Math.max(top, s.y); if (s.grounded) break; }
    return { top, x: s.x };
  };
  const slow = peak(0.8), fast = peak(1.5);
  assert.ok(Math.abs(slow.top - fast.top) < 1e-9, 'same peak');
  assert.ok(fast.x > slow.x + 1, 'lands further along');
});

test('speed portals are portals for placement, validation and share codes', async () => {
  for (const type of Object.keys(SPEEDS)) {
    assert.ok(PORTALS.includes(type)); assert.ok(TYPES.includes(type));
    assert.doesNotThrow(() => validateLevel({ ...empty, objects: [object(type, 10, 1)] }));
    assert.throws(() => validateLevel({ ...empty, objects: [{ ...object(type, 10, 1), scale: 2 }] }), /Invalid scale/);
  }
  const level = { ...empty, objects: Object.keys(SPEEDS).map((t, i) => object(t, 10 + i * 3, 0)) };
  assert.deepEqual((await decodeLevel(await encodeLevel(level))).objects.map((o) => o.type), Object.keys(SPEEDS));
});
