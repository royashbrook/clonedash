import test from 'node:test';
import assert from 'node:assert/strict';
import { createState, step, SIZE, DEATH_INSET, ZONES, BLOCKS, TYPES, object, validateLevel } from '../src/engine.ts';
import { render } from '../src/render.ts';
import { encodeLevel, decodeLevel } from '../src/transfer.ts';
const level = (objects) => ({ name: 'Pass', length: 40, height: 10, objects });
const run = (s, ticks, held = false) => { for (let i = 0; i < ticks && s.status === 'playing'; i++) step(s, held); return s; };
// a visible wall three high at x=6, and the same cells covered by a zone
const wall = (type = 'grid') => [0, 1, 2].map(y => object(type, 6, y));
const zone = (type, cells) => cells.map(o => object(type, o.x, o.y));

test('W: touching it, a wall stops the run instead of crashing it, and holds it still', () => {
  for (const at of [6, 5]) { // on the wall, or just in front of it
    const s = createState(level([...wall(), ...[0, 1, 2].map(y => object('w-block', at, y))]));
    const xs = [];
    for (let i = 0; i < 300 && s.status === 'playing'; i++) { step(s, false); xs.push(s.x); }
    assert.equal(s.status, 'playing', `W at ${at}`);
    assert.equal(s.x, 6 - SIZE + DEATH_INSET, 'held with its hazard box against the wall face');
    assert.equal(xs.at(-1), xs.at(-120), 'not creeping or jittering');
    assert.equal(s.wall, 6, 'the held wall face is recorded for drawing');
  }
  assert.equal(run(createState(level(wall())), 240).status, 'dead', 'no zone, the wall kills');
  // a W that stops short of the wall is never touched
  assert.equal(run(createState(level([...wall(), object('w-block', 3, 0)])), 240).status, 'dead');
});

test('W: a jump that clears a low wall carries on; a plane flies over a tall one', () => {
  const low = level([object('grid', 6, 0), object('w-block', 6, 0)]), s = createState(low);
  for (let i = 0; i < 150; i++) step(s, false);
  assert.equal(s.x, 6 - SIZE + DEATH_INSET, 'waiting at the wall');
  for (let i = 0; i < 250 && s.status === 'playing'; i++) step(s, i < 3);
  assert.equal(s.status, 'playing'); assert.ok(s.x > 12, `carried on, x=${s.x}`);
  assert.equal(s.wall, null, 'free again once over it');
  const plane = { ...createState(level([...wall(), ...zone('w-block', wall())])), mode: 'plane' };
  run(plane, 300, true);
  assert.equal(plane.status, 'playing'); assert.ok(plane.x > 10, `flew over, x=${plane.x}`);
});

test('W: head hits and spikes still kill', () => {
  const roof = [object('grid', 6, 2)];
  const head = run({ ...createState(level([...roof, ...zone('w-block', roof)])), x: 6, y: 1.2, vy: 6, grounded: false }, 30);
  assert.equal(head.status, 'dead', 'a W is for walls, not heads');
  const spike = [object('spike', 6, 0)];
  assert.equal(run(createState(level([...spike, ...zone('w-block', spike)])), 240).status, 'dead');
});

test('R: touching it, a head hit is a bump: the jump stops at the roof and falls back', () => {
  const roof = Array.from({ length: 12 }, (_, i) => object('grid', 6 + i, 2));
  const jump = (objects) => {
    const s = { ...createState(level(objects)), x: 7 };
    let top = 0;
    for (let i = 0; i < 200 && s.status === 'playing'; i++) { step(s, i < 3); if (s.x < 18) top = Math.max(top, s.y); }
    return { s, top };
  };
  for (const y of [2, 1]) { // on the roof, or in the gap under it
    const { s, top } = jump([...roof, ...roof.map(o => object('r-block', o.x, y))]);
    assert.equal(s.status, 'playing', `R at ${y}`);
    assert.equal(top, 2 - SIZE, 'stopped flush under the roof, never inside it');
    assert.equal(s.y, 0, 'fell back to the floor');
    assert.ok(s.x > 15, 'and kept running under the roof');
  }
  assert.equal(jump(roof).s.status, 'dead', 'no zone, the head hit kills');
  // inverted gravity: the head points down, so the bumped face is the block top
  const covered = level([...roof, ...roof.map(o => object('r-block', o.x, 2))]);
  const drop = { ...createState(covered), x: 7, y: 5, vy: -11, gravity: 1, grounded: false };
  let low = 10;
  for (let i = 0; i < 120 && drop.status === 'playing'; i++) { step(drop, false); if (drop.x < 18) low = Math.min(low, drop.y); }
  assert.equal(drop.status, 'playing'); assert.equal(low, 3, 'bumped on the top face, never inside');
});

test('R: a side hit still kills', () => {
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

