import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createState, step, STEP, SIZE, object, validateLevel } from '../src/engine.ts';
import { Run } from '../src/run.ts';
import { encodeLevel, decodeLevel } from '../src/transfer.ts';

const room = { name: 'Door', length: 40, height: 12, objects: [] };
const state = (mode, gravity = -1, objects = []) => ({
  ...createState({ ...room, objects }), mode, gravity, y: gravity < 0 ? 0 : room.height - SIZE,
});
function jump(mode, gravity, heldTicks, pressAgain = false) {
  const s = state(mode, gravity), start = s.y;
  let peak = 0;
  for (let tick = 0; tick < 400; tick++) {
    step(s, tick < heldTicks || (pressAgain && tick > heldTicks));
    assert.equal(s.status, 'playing');
    peak = Math.max(peak, (start - s.y) * gravity);
    if (s.grounded) return peak;
  }
  assert.fail('no landing');
}

test('door starts with the square hop, grows with the hold up to about 4.5 blocks, and cannot regain lift in midair', () => {
  for (const gravity of [-1, 1]) {
    const heights = [1, 12, 30, 60, 180].map(ticks => jump('door', gravity, ticks));
    assert.ok(Math.abs(heights[0] - jump('square', gravity, 1)) < 1e-8, 'tap follows the square');
    heights.slice(1).forEach((h, i) => assert.ok(h > heights[i] + 0.15, JSON.stringify(heights)));
    assert.ok(heights.at(-1) > 4.4 && heights.at(-1) <= 4.501);
    assert.equal(jump('door', gravity, 12, true), heights[1], 'repress during ascent changes nothing');
  }
});

test('a door is a real editor portal, shares and loads, and does not extend an existing airborne square jump', async () => {
  const l = validateLevel({ ...room, objects: [object('door', 3, 0)] });
  assert.equal((await decodeLevel(await encodeLevel(l))).objects[0].type, 'door');
  const s = state('square', -1, l.objects), control = state('square');
  for (let i = 0; i < 155; i++) {
    step(s, true); step(control, true);
    if (i === 60) assert.equal(s.mode, 'door');
    assert.ok(Math.abs(s.y - control.y) < 1e-8, 'portal does not grant lift in midair');
    if (s.grounded) break;
  }
});

test('the grounded tap buffer, release between ticks, interrupt and reset belong to the current jump', () => {
  const r = new Run(room);
  r.readyTime = 0;
  r.state.mode = 'door';
  r.press(); r.release(); r.advance(STEP);
  assert.ok(r.state.y > 0, 'a press and release between physics ticks still jumps');
  const start = state('square'); step(start, true);
  r.press(); r.advance(STEP); step(start, false);
  assert.equal(r.state.y, start.y, 'fresh press cannot reconnect the released jump');
  r.reset();
  assert.equal(r.state.mode, 'square');
  assert.equal(r.held, false);
  r.readyTime = 0; r.state.mode = 'door'; r.press(); r.advance(STEP);
  r.interrupt(); r.press(); r.advance(STEP);
  assert.equal(r.state.y, start.y, 'pause ends the old hold, even if a fresh press precedes the next tick');
});

test('door has square contact: the far boundary, a block wall and a spike are lethal', () => {
  for (const mode of ['square', 'door']) {
    for (const gravity of [-1, 1]) {
      const s = state(mode, gravity);
      s.grounded = false;
      s.y = gravity < 0 ? room.height - SIZE - 0.02 : 0.02;
      s.vy = -gravity * 8;
      step(s, true);
      assert.equal(s.status, 'dead', mode);
    }
    for (const type of ['block', 'spike']) {
      const s = state(mode, -1, [object(type, 3, 0)]);
      for (let i = 0; i < 70; i++) step(s, false);
      assert.equal(s.status, 'dead', type);
    }
  }
});

test('the shared example: tapping at the portal hits the four-block wall; holding clears the trail', async () => {
  const doc = await readFile(new URL('../docs/door.md', import.meta.url), 'utf8');
  const level = await decodeLevel(doc.match(/^cdl1\.[\w-]+$/m)[0]);
  for (const [duration, status] of [[1, 'dead'], [120, 'complete']]) {
    const s = createState(level);
    let ticks = 0;
    for (let i = 0; i < 1000 && s.status === 'playing'; i++) step(s, s.x >= 3 && ticks++ < duration);
    assert.equal(s.status, status);
    assert.equal(s.mode, 'door');
  }
});

test('a ring or booster interrupts lift and keeps its own bounce height', () => {
  for (const [type, at] of [['ring', 2], ['red-pad', 3]]) {
    const s = state('door', -1, [object(type, 3, at)]);
    step(s, true);
    for (let i = 0; i < 50 && !(s.usedRings.length || s.fx?.pads.length); i++)
      step(s, true, STEP, type === 'ring');
    assert.ok(s.usedRings.length || s.fx?.pads.length, type + ' actually fired');
    const vy = s.vy;
    step(s, true);
    assert.ok(Math.abs(s.vy - (vy - 16 * STEP)) < 1e-8, type + ' returns to normal gravity');
  }
});
