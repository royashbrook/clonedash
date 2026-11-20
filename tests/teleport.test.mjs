import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createState, step, object, validateLevel, destination } from '../src/engine.ts';

// Teleports (#139, docs/teleport.md): the trigger and the ring share one destination rule.
const level = (objects, length = 80) => ({ name: 'Teleports', length, height: 10, objects });
const marker = (x, y, group) => ({ ...object('block', x, y), noTouch: true, group });
const trigger = (x, target, more = {}) => ({ ...object('teleport-trigger', x, 0), ...(target && { target }), ...more });
// run until the player's x jumps backward or far forward in one step, or the run ends; the jumps it saw
function run(s, limit = 4000, press = () => false) {
  const jumps = [];
  for (let i = 0; i < limit && s.status === 'playing'; i++) {
    const before = s.x;
    step(s, press(s, i));
    if (s.x < before || s.x - before > 1) jumps.push([Math.round(before * 100) / 100, s.x]);
  }
  return jumps;
}

test('the destination: the group piece furthest left, then lowest, then first placed; none is null', () => {
  const objects = [marker(30, 4, 1), marker(30, 2, 1), marker(31, 0, 1), marker(30, 2, 1), marker(12, 0, 2)];
  assert.deepEqual(destination(objects, 1), [30, 2]);
  assert.deepEqual(destination(objects, 2), [12, 0]);
  assert.equal(destination(objects, 3), null, 'a group with no pieces');
  assert.equal(destination(objects, undefined), null, 'no target');
  // the run's own group map gives the same answer
  const s = createState(level([trigger(5, 1), ...objects]));
  assert.deepEqual(destination(s.level.objects, 1, s.fx.groups), [30, 2]);
});

test('a teleport trigger sends you to its destination once the step is done, still running, no rise or fall', () => {
  const s = createState(level([trigger(5, 1), marker(30, 0, 1)]));
  const jumps = run(s);
  assert.equal(jumps.length, 1);
  assert.ok(jumps[0][0] > 4.8 && jumps[0][0] <= 5, `fired on the step that passed x 5: ${jumps[0]}`);
  assert.equal(jumps[0][1], 30);
  assert.equal(s.status, 'complete');
});

test('arriving is not crossing: triggers jumped over wait until you are behind them, then fire as normal', () => {
  // forward over a colour trigger at 20 to 40, then a trigger at 50 sends you back to 10
  const color = { ...object('color-trigger', 20, 0), target: 9, color: '#ff0000' };
  const objects = [trigger(5, 1), color, marker(40, 0, 1), trigger(50, 2), marker(10, 0, 2), marker(70, 3, 9)];
  const s = createState(level(objects));
  let colorFiredAt = null;
  const jumps = run(s, 4000, (st) => { if (colorFiredAt === null && st.fx.fired[1]) colorFiredAt = st.x; return false; });
  assert.deepEqual(jumps.map(([, to]) => to), [40, 10], 'forward to 40, back to 10, then never again');
  assert.ok(colorFiredAt !== null && colorFiredAt > 10 && colorFiredAt < 21, `the colour fired once crossed after the jump back: ${colorFiredAt}`);
  assert.equal(s.status, 'complete');
});

test('no chains in a step, and none forever: a teleport you land on fires on a later step, and once-a-run ends a loop', () => {
  // A at 5 lands you at 30, right on B; B at 30 sends you back to 10, past A, which already fired
  const s = createState(level([trigger(5, 1), marker(30, 0, 1), trigger(30, 2), marker(10, 0, 2)]));
  const xs = [];
  for (let i = 0; i < 4000 && s.status === 'playing'; i++) { step(s, false); xs.push(s.x); }
  const a = xs.indexOf(30), b = xs.indexOf(10);
  assert.ok(a >= 0 && b === a + 1, `one step at 30, then 10 the next step: ${a} ${b}`);
  assert.equal(s.status, 'complete', 'once a run each, so the loop ends');
});

test('a teleport with nowhere to go is nothing: the trigger is spent, the ring is no ring and the tap jumps', () => {
  const t = createState(level([trigger(5, 7), marker(30, 0, 1)]));
  assert.deepEqual(run(t), []);
  assert.equal(t.fx.fired[0], 1, 'the trigger fired, and did nothing');
  // a ring with no destination: the tap in reach is the square's jump, and the ring is not used
  const ring = { ...object('teleport-ring', 5, 0), target: 4 };
  const r = createState(level([ring, marker(30, 0, 1)]));
  while (r.x < 4.6) step(r, false);
  assert.doesNotThrow(() => step(r, true));
  assert.ok(r.vy > 0, 'jumped');
  assert.deepEqual(r.usedRings, []);
});

test('a teleport ring: a tap in reach lands you at once, it is used, and the step runs on from the landing', () => {
  const ring = { ...object('teleport-ring', 5, 0), target: 1 };
  const color = { ...object('color-trigger', 20, 0), target: 9 };
  // a wall on the way does not matter: the step runs from the landing, not across the gap
  const s = createState(level([ring, color, marker(30, 2, 1), marker(60, 0, 9), object('block', 15, 0), object('block', 15, 1)]));
  while (s.x < 4.6) step(s, false);
  step(s, true);
  assert.equal(s.status, 'playing');
  assert.ok(s.x > 30 && s.x < 30.2, `landed and moved on: ${s.x}`);
  assert.deepEqual(s.usedRings, [0]);
  assert.equal(s.fx.fired[1], 0, 'the trigger it jumped over did not fire');
  assert.equal(s.fx.skipped[1], 1);
});

test('the destination is where the group stands now: a move trigger moved it first', () => {
  const move = { ...object('move-trigger', 2, 0), target: 1, moveX: 10 };
  const s = createState(level([move, trigger(5, 1), marker(30, 0, 1)]));
  const jumps = run(s);
  assert.equal(jumps[0][1], 40);
});

test('landing inside a touch trigger counts as touched: it fires only after you leave it and come back', () => {
  const touch = { ...object('color-trigger', 30, 0), target: 9, touch: true };
  const s = createState(level([trigger(5, 1), touch, marker(30, 0, 1), marker(60, 0, 9)]));
  run(s);
  assert.equal(s.fx.fired[1], 0);
});

test('a restart is a fresh run: everything fires again the same way', () => {
  const objects = [trigger(5, 1), marker(40, 0, 1), trigger(50, 2), marker(10, 0, 2)];
  assert.deepEqual(run(createState(level(objects))), run(createState(level(objects))));
});

test('teleports validate: a target on the trigger and the ring only, no time on the trigger', () => {
  assert.doesNotThrow(() => validateLevel(level([trigger(5, 1), { ...object('teleport-ring', 6, 1), target: 2, multi: true }, marker(30, 0, 1)])));
  assert.doesNotThrow(() => validateLevel(level([trigger(5, 1, { touch: true, multi: true })])));
  assert.throws(() => validateLevel(level([trigger(5, 1, { duration: 1 })])), /trigger time|duration|Invalid/);
  assert.throws(() => validateLevel(level([{ ...object('ring', 6, 1), target: 2 }])), /Invalid trigger group/);
  assert.throws(() => validateLevel(level([{ ...object('teleport-ring', 6, 1), target: 0 }])), /Invalid trigger group/);
});

test('a copy of the game from before teleports refuses a level with either one', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'cube-153f4a9-'));
  await writeFile(join(dir, 'src.tar'), execFileSync('git', ['archive', '--format=tar', '153f4a923e29a2e20e769a0ee1336be33329983e', 'src']));
  execFileSync('tar', ['-xf', join(dir, 'src.tar'), '-C', dir]);
  const old = await import(join(dir, 'src', 'engine.ts'));
  assert.throws(() => old.validateLevel(level([trigger(5, 1), marker(30, 0, 1)])));
  assert.throws(() => old.validateLevel(level([{ ...object('teleport-ring', 6, 1), target: 1 }, marker(30, 0, 1)])));
});

test('two teleports crossed in one step go one after the other, in the order they were placed', () => {
  const s = createState(level([trigger(5, 1), trigger(5, 2), marker(30, 0, 1), marker(60, 0, 2)]));
  assert.deepEqual(run(s).map(([, to]) => to), [30, 60]);
});

test('a teleport ring onto a block top: the step starts at the landing, so you stand on it', () => {
  // the landing is one block up, on a two-block-wide block, from a ring tapped on the ground
  const ring = { ...object('teleport-ring', 5, 0), target: 1 };
  const s = createState(level([ring, object('block', 30, 0), object('block', 31, 0), marker(30, 1, 1)]));
  while (s.x < 4.6) step(s, false);
  step(s, true);
  for (let i = 0; i < 10; i++) step(s, false);
  assert.equal(s.status, 'playing');
  assert.equal(s.y, 1, 'standing on the block');
  assert.equal(s.grounded, true);
});
