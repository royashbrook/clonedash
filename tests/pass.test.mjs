import test from 'node:test';
import assert from 'node:assert/strict';
import { createState, step, SIZE, ZONES, BLOCKS, TYPES, object, validateLevel } from '../src/engine.ts';
import { render } from '../src/render.ts';
import { encodeLevel, decodeLevel } from '../src/transfer.ts';
const level = (objects) => ({ name: 'Pass', length: 40, height: 10, objects });
const run = (s, ticks, held = false) => { for (let i = 0; i < ticks && s.status === 'playing'; i++) step(s, held); return s; };
// a visible wall three high at x=6, and the same cells covered by a zone
const wall = (type = 'grid') => [0, 1, 2].map(y => object(type, 6, y));
const zone = (type, cells) => cells.map(o => object(type, o.x, o.y));

test('W: laid over a wall, the run goes straight through it; the same wall without it kills', () => {
  const through = run(createState(level([...wall(), ...zone('w-block', wall())])), 240);
  assert.equal(through.status, 'playing'); assert.ok(through.x > 8, `went through, x=${through.x}`); assert.equal(through.y, 0);
  assert.equal(run(createState(level(wall())), 240).status, 'dead', 'no zone, the wall kills');
  // one scaled zone can cover the whole wall
  const big = run(createState(level([...wall(), { ...object('w-block', 6, 0), scale: 3 }])), 240);
  assert.equal(big.status, 'playing');
  // the zone has to be touched: one that stops short of the wall does nothing
  const short = run(createState(level([...wall(), object('w-block', 3, 0)])), 240);
  assert.equal(short.status, 'dead');
});

test('W: only side hits pass; a head hit and a spike still kill inside it', () => {
  const roof = [object('grid', 6, 2)], over = [...roof, ...zone('w-block', roof)];
  const head = run({ ...createState(level(over)), x: 6, y: 1.2, vy: 6, grounded: false }, 30);
  assert.equal(head.status, 'dead', 'rising into a block head first is still a head hit');
  const spike = [object('spike', 6, 0)];
  assert.equal(run(createState(level([...spike, ...zone('w-block', spike)])), 240).status, 'dead');
});

test('R: laid over a shelf, the run jumps up through it and lands on top; without it the head hit kills', () => {
  // a long shelf, since the trail keeps moving forward for the whole rise and fall
  const shelf = Array.from({ length: 30 }, (_, i) => object('grid', 6 + i, 2)), covered = level([...shelf, ...zone('r-block', shelf)]);
  const up = { ...createState(covered), x: 6.2, y: 1, vy: 9, grounded: false };
  let passed = false;
  for (let i = 0; i < 60 && up.status === 'playing'; i++) { step(up, false); if (up.y > 1.5 && up.y < 2.5) passed = true; }
  assert.equal(up.status, 'playing'); assert.ok(passed, 'was inside the block on the way up'); assert.ok(up.y > 3, `cleared it, y=${up.y}`);
  run(up, 200); assert.equal(up.status, 'playing'); assert.equal(up.y, 3, 'came down onto its top'); assert.equal(up.grounded, true);
  const bare = run({ ...createState(level(shelf)), x: 6.2, y: 1, vy: 9, grounded: false }, 60);
  assert.equal(bare.status, 'dead', 'no zone, the head hit kills');
  const short = run({ ...createState(covered), x: 6.2, y: 1, vy: 5, grounded: false }, 120);
  assert.equal(short.status, 'playing'); assert.equal(short.y, 0, 'too slow to clear it: back down through it to the floor');
  // inverted gravity: the head points down, so dropping onto it from above passes through, and
  // gravity then brings the feet back up to rest on its underside
  const drop = { ...createState(covered), x: 6.2, y: 4, vy: -11, gravity: 1, grounded: false };
  let below = false;
  for (let i = 0; i < 200 && drop.status === 'playing'; i++) { step(drop, false); if (drop.y + SIZE < 2) below = true; }
  assert.equal(drop.status, 'playing'); assert.ok(below, 'fell through'); assert.equal(drop.y, 2 - SIZE); assert.equal(drop.grounded, true);
  // the plane slides along block undersides, but an R lets it up through
  const plane = run({ ...createState(covered), mode: 'plane', x: 6.2, y: 1, vy: 3, grounded: false }, 30, true);
  assert.equal(plane.status, 'playing'); assert.ok(plane.y > 2 - SIZE + .1, `not pinned under it, y=${plane.y}`);
});

test('R: a side hit still kills inside it', () => {
  assert.equal(run(createState(level([...wall(), ...zone('r-block', wall())])), 240).status, 'dead');
});

test('a zone on its own is never touched: no floor, no wall, the run is unchanged', () => {
  for (const type of ZONES) {
    const lone = level([0, 1, 2].map(y => object(type, 6, y))), a = createState(lone), b = createState(level([]));
    for (let i = 0; i < 240; i++) { step(a, i % 30 < 5); step(b, i % 30 < 5); }
    assert.equal(a.status, 'playing'); assert.equal(a.x, b.x); assert.equal(a.y, b.y);
    const fall = run({ ...createState(level([object(type, 6, 2)])), x: 6, y: 3.05, vy: -1, grounded: false }, 120);
    assert.equal(fall.y, 0, `${type} is not a floor`);
  }
});

test('zones validate, scale, export, sit in either layer, and are drawn only in the editor', async () => {
  for (const type of ZONES) { assert.ok(!BLOCKS.includes(type)); assert.ok(TYPES.includes(type)); }
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
