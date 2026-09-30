import test from 'node:test';
import assert from 'node:assert/strict';
import { createState, step, SIZE, PASS, BLOCKS, TYPES, object, validateLevel } from '../src/engine.ts';
import { render } from '../src/render.ts';
import { encodeLevel, decodeLevel } from '../src/transfer.ts';
const level = (objects) => ({ name: 'Pass', length: 40, height: 10, objects });
const run = (s, ticks, held = false) => { for (let i = 0; i < ticks && s.status === 'playing'; i++) step(s, held); return s; };

test('W: walk in from the side and out the other side; stand on top; a head hit still kills', () => {
  const wall = level([0, 1, 2].map(y => object('w-block', 6, y)));
  const through = run(createState(wall), 240);
  assert.equal(through.status, 'playing'); assert.ok(through.x > 8, `walked through, x=${through.x}`); assert.equal(through.y, 0);
  const plain = run(createState(level([0, 1, 2].map(y => object('outline', 6, y)))), 240);
  assert.equal(plain.status, 'dead', 'the same wall in outline kills');
  const top = run({ ...createState(level([object('w-block', 6, 2)])), x: 6, y: 3.05, vy: -1, grounded: false }, 10);
  assert.equal(top.status, 'playing'); assert.equal(top.y, 3); assert.equal(top.grounded, true);
  const head = run({ ...createState(level([object('w-block', 6, 2)])), x: 6, y: 1.2, vy: 6, grounded: false }, 30);
  assert.equal(head.status, 'dead', 'rising into a W head first is still a head hit');
  // a column of W blocks is one passage: jumping inside it crosses the seams
  const column = run({ ...createState(wall), x: 6.1, y: 0, vy: 6, grounded: false }, 60);
  assert.equal(column.status, 'playing');
  // inverted gravity: the head is on top, so coming down onto a W kills, and its underside holds
  const inverted = run({ ...createState(level([object('w-block', 6, 2)])), x: 6, y: 3.2, vy: -4, gravity: 1, grounded: false }, 40);
  assert.equal(inverted.status, 'dead');
  const hang = run({ ...createState(level([object('w-block', 6, 2)])), x: 6, y: 2 - SIZE - .05, vy: 1, gravity: 1, grounded: false }, 10);
  assert.equal(hang.status, 'playing'); assert.equal(hang.y, 2 - SIZE); assert.equal(hang.grounded, true);
});

test('R: rise up through it and land on top, fall back through it, but a side hit kills', () => {
  // a long shelf, since the trail keeps moving forward for the whole rise and fall
  const shelf = level(Array.from({ length: 30 }, (_, i) => object('r-block', 6 + i, 2)));
  const up = { ...createState(shelf), x: 6.2, y: 1, vy: 9, grounded: false };
  let passed = false;
  for (let i = 0; i < 60 && up.status === 'playing'; i++) { step(up, false); if (up.y > 1.5 && up.y < 2.5) passed = true; }
  assert.equal(up.status, 'playing'); assert.ok(passed, 'was inside the block on the way up'); assert.ok(up.y > 3, `cleared it, y=${up.y}`);
  run(up, 200); assert.equal(up.status, 'playing'); assert.equal(up.y, 3, 'came down onto its top'); assert.equal(up.grounded, true);
  const short = run({ ...createState(shelf), x: 6.2, y: 1, vy: 5, grounded: false }, 120);
  assert.equal(short.status, 'playing'); assert.equal(short.y, 0, 'too slow to clear it: back down through it to the floor');
  const side = run(createState(level([0, 1, 2].map(y => object('r-block', 6, y)))), 240);
  assert.equal(side.status, 'dead', 'the side of an R is a wall');
  // inverted gravity: the head points down, so dropping onto an R from above passes through,
  // and gravity then brings the feet back up to rest on its underside
  const drop = { ...createState(shelf), x: 6.2, y: 4, vy: -11, gravity: 1, grounded: false };
  let below = false;
  for (let i = 0; i < 200 && drop.status === 'playing'; i++) { step(drop, false); if (drop.y + SIZE < 2) below = true; }
  assert.equal(drop.status, 'playing'); assert.ok(below, 'fell through'); assert.equal(drop.y, 2 - SIZE); assert.equal(drop.grounded, true);
  // the plane slides along block undersides, but an R lets it up through
  const plane = run({ ...createState(shelf), mode: 'plane', x: 6.2, y: 1, vy: 3, grounded: false }, 30, true);
  assert.equal(plane.status, 'playing'); assert.ok(plane.y > 2 - SIZE + .1, `not pinned under it, y=${plane.y}`);
});

test('pass blocks are blocks (scale, angle, background), validate, export, and are drawn only in the editor', async () => {
  for (const type of PASS) { assert.ok(BLOCKS.includes(type)); assert.ok(TYPES.includes(type)); }
  const ok = level([{ ...object('w-block', 10, 1), scale: 2, rotation: 30 }, { ...object('r-block', 14, 1), layer: 'background' }]);
  assert.deepEqual(validateLevel(ok), ok);
  assert.deepEqual((await decodeLevel(await encodeLevel(ok))).objects.map(o => o.type), ['w-block', 'r-block']);
  Object.assign(globalThis, { innerWidth: 932, innerHeight: 430, devicePixelRatio: 1 });
  const letters = (options) => {
    const log = [];
    const ctx = new Proxy({}, { set(t, k, v) { t[k] = v; return true; }, get(t, k) { if (k in t) return t[k]; return (...a) => { log.push([k, ...a]); if (k === 'createLinearGradient') return { addColorStop() {} }; }; } });
    render({ width: 932, height: 430, getContext: () => ctx }, options);
    return log.filter(c => c[0] === 'fillText' && ['W', 'R'].includes(c[1])).map(c => c[1]);
  };
  const pieces = level([object('w-block', 5, 1), object('r-block', 7, 1)]);
  assert.deepEqual(letters({ state: null, level: pieces, editing: true }), ['W', 'R']);
  assert.deepEqual(letters({ state: createState(pieces), level: pieces }), [], 'invisible in play');
});
