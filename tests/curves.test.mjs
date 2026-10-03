import test from 'node:test';
import assert from 'node:assert/strict';
import { createState, step, object, CURVES, SLOPES, TYPES, SCALABLE, polygon, validateLevel } from '../src/engine.ts';
import { encodeLevel, decodeLevel } from '../src/transfer.ts';

// Curves (#79): ramps whose slope is a quarter circle. A scoop bends up like a skate ramp; a hill
// bulges out, steep at its foot, so it is run downhill.
const level = (objects) => ({ name: 'Curves', length: 40, height: 10, objects });
const run = (objects, ticks = 240, start = {}) => {
  const s = { ...createState(level(objects)), ...start }; let top = 0;
  for (let i = 0; i < ticks && s.status === 'playing'; i++) { step(s, false); top = Math.max(top, s.y); }
  return { s, top };
};

test('a scoop on the floor is run up and over without dying', () => {
  for (const type of ['scoop', 'scoop-grid', 'scoop-black']) {
    const { s, top } = run([object(type, 6, 0)]);
    assert.equal(s.status, 'playing', type);
    assert.ok(s.x > 9, `${type} carried on, x=${s.x}`);
    assert.ok(top > 0.7, `${type} rode up the curve, top=${top}`);
  }
});

test('a hill is run downhill off a block, and its steep foot is a wall', () => {
  // standing on a block one high, then onto the hill's flat top and down its face
  const down = run([object('block', 4, 0), object('block', 5, 0), { ...object('hill', 6, 0), flipX: true }], 240, { x: 4, y: 1 });
  assert.equal(down.s.status, 'playing', 'downhill');
  assert.ok(down.s.x > 9 && down.s.y === 0, `back on the floor, x=${down.s.x} y=${down.s.y}`);
  assert.equal(run([object('hill', 6, 0)]).s.status, 'dead', 'walked into the steep foot');
});

test('curves are slopes: quarter-circle outline, validate, scale, export', async () => {
  for (const type of CURVES) {
    assert.ok(SLOPES.includes(type) && TYPES.includes(type) && SCALABLE.includes(type));
    const p = polygon(object(type, 0, 0));
    assert.equal(p.length, 10, 'foot, corner, top and seven arc points');
    for (const [x, y] of p.slice(3)) {
      const d = type.startsWith('scoop') ? Math.hypot(x, y - 1) : Math.hypot(x - 1, y);
      assert.ok(Math.abs(d - 1) < 1e-9, `${type} arc point on its circle`);
    }
  }
  const all = level(CURVES.map((t, i) => ({ ...object(t, 5 + i * 3, 0), scale: 2, rotation: 30 })));
  assert.deepEqual(validateLevel(all), all);
  assert.deepEqual((await decodeLevel(await encodeLevel(all))).objects.map((o) => o.type), CURVES);
});
