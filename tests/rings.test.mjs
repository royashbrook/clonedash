import test from 'node:test';
import assert from 'node:assert/strict';
import { createState, step, JUMP, GRAVITY, STEP, RING_BOUNCE, ringSpeed, object, validateLevel } from '../src/engine.ts';
import { encodeLevel, decodeLevel } from '../src/transfer.ts';
const level = (objects) => ({ name: 'Rings', length: 40, height: 20, objects });

// Tap a ring from rest at its own height and report the peak the player reaches above it.
function peak(ring, gravity = -1) {
  const s = { ...createState(level([ring])), x: 5, y: ring.y, gravity, grounded: false, vy: 0 };
  step(s, true);
  let top = 0;
  for (let i = 0; i < 600; i++) { step(s, false); top = Math.max(top, gravity < 0 ? s.y - ring.y : ring.y - s.y); }
  assert.deepEqual(s.usedRings, [0]);
  return top;
}

test('a ring with no bounce field is the original ring; a set bounce is its peak height in blocks', () => {
  const plain = object('ring', 5, 3);
  assert.equal(ringSpeed(plain), JUMP);
  assert.equal(JUMP, Math.sqrt(2 * GRAVITY * RING_BOUNCE), 'the original bounce is a 2.25 block peak');
  assert.ok(Math.abs(peak(plain) - RING_BOUNCE) < 0.05);
  const purple = { ...plain, color: '#c77dff', bounce: 1 };
  assert.ok(Math.abs(peak(purple) - 1) < 0.05, `purple peaked at ${peak(purple)}`);
  const red = { ...plain, color: '#ff5c7a', bounce: 5 };
  assert.ok(Math.abs(peak(red) - 5) < 0.05, `red peaked at ${peak(red)}`);
  // the same under inverted gravity: the bounce goes toward the floor by the same height
  assert.ok(Math.abs(peak({ ...red, y: 12 }, 1) - 5) < 0.05);
  // colour is looks only
  assert.equal(ringSpeed({ ...plain, color: '#ffffff' }), JUMP);
});

test('ring colour and bounce are validated, rings only, and the share code keeps them', async () => {
  const ok = level([{ ...object('ring', 10, 1), color: '#ffffff', bounce: 4.5 }]);
  assert.deepEqual(validateLevel(ok), ok);
  for (const color of ['#fff', 'red', 'url(x)', 1, '#gggggg']) assert.throws(() => validateLevel(level([{ ...object('ring', 10, 1), color }])), /Invalid ring colour/);
  for (const bounce of [0, 0.2, 10.5, NaN, Infinity, '2']) assert.throws(() => validateLevel(level([{ ...object('ring', 10, 1), bounce }])), /Invalid ring bounce/);
  assert.throws(() => validateLevel(level([{ ...object('block', 10, 1), color: '#ffffff' }])), /Invalid ring colour/);
  assert.throws(() => validateLevel(level([{ ...object('block', 10, 1), bounce: 2 }])), /Invalid ring bounce/);
  const back = (await decodeLevel(await encodeLevel(ok))).objects[0];
  assert.equal(back.color, '#ffffff'); assert.equal(back.bounce, 4.5);
  const plain = (await decodeLevel(await encodeLevel(level([object('ring', 10, 1)])))).objects[0];
  assert.equal('color' in plain, false); assert.equal('bounce' in plain, false);
});

test('a dark blue gravity ring flips gravity on a tap instead of bouncing, once per run', async () => {
  const orb = { ...object('ring', 5, 3), color: '#2b4cff', flipsGravity: true };
  for (const gravity of [-1, 1]) {
    const s = { ...createState(level([orb])), x: 5, y: 3, gravity, grounded: false, vy: 0.2 };
    step(s, true);
    assert.equal(s.gravity, -gravity, 'flipped');
    assert.deepEqual(s.usedRings, [0]);
    // used: a second tap in reach does nothing
    step(s, false); step(s, true);
    assert.equal(s.gravity, -gravity, 'one flip per ring per run');
  }
  // the run carries on to the other side: a tap at the floor ring falls up to the ceiling
  const s = { ...createState(level([{ ...orb, y: 0 }])), x: 5 };
  step(s, true);
  for (let i = 0; i < 600 && s.status === 'playing'; i++) step(s, false);
  assert.equal(s.status, 'playing'); assert.ok(s.y > 18, `fell up to the ceiling, y=${s.y}`);
  // validated: rings only, true only, no bounce with it; the share code keeps it
  const ok = level([orb]);
  assert.deepEqual(validateLevel(ok), ok);
  for (const bad of [{ ...orb, flipsGravity: false }, { ...orb, flipsGravity: 1 }, { ...orb, bounce: 3 }, { ...object('block', 10, 1), flipsGravity: true }])
    assert.throws(() => validateLevel(level([bad])), /Invalid gravity ring/);
  assert.equal((await decodeLevel(await encodeLevel(ok))).objects[0].flipsGravity, true);
  assert.equal('flipsGravity' in (await decodeLevel(await encodeLevel(level([object('ring', 10, 1)])))).objects[0], false);
});
