import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { LoopPlayer, STEP } from '../src/loop-player.ts';
import { blankLoop } from '../src/loop.ts';
import { recorder } from './audio-graph.mjs';

// The live loop player's races (#121, docs/loops.md "Playing"), on the recording context with a
// clock the test moves and timers it fires. This is the schedule the player asks for, not a
// claim about how a browser renders it.
const loop = { ...blankLoop(), notes: [[0], [3], [5], [7], [10], [12], [15], [17]] };
function rig({ resume } = {}) {
  let now = 0;
  const { RecordingContext, log } = recorder({ live: { now: () => now, resume } });
  const steps = [];
  const player = new LoopPlayer(() => loop, (s) => steps.push(s), () => new RecordingContext(2, 0, 44100));
  return { player, log, steps, at: (t) => { now = t; }, now: () => now };
}
const starts = (log, from = 0) => log.slice(from).filter((e) => e[0] === 'start');
const outputs = (log) => log.filter((e) => e[0] === 'connect' && e[2] === 'destination').map((e) => e[1]);
const cut = (log, id) => log.some((e) => e[0] === 'disconnect' && e[1] === id);

test('after a long gap nothing missed is played late, and the loop keeps its place', async (t) => {
  t.mock.timers.enable({ apis: ['setInterval'] });
  const r = rig();
  await r.player.start();
  assert.ok(starts(r.log).length > 0);
  const before = r.log.length;
  r.at(10); // the tab stalled for ten seconds
  t.mock.timers.tick(25);
  const late = starts(r.log, before).filter((e) => e[e.length - 3] < e[e.length - 1]);
  assert.deepEqual(late, [], 'no source starts in the past');
  assert.ok(starts(r.log, before).length > 0, 'it plays on from now');
  // the phase is where the clock is: every step from the first at 0.06 counted, none played
  const { step, bar, next } = r.player.phase, done = Math.round((next - 0.06) / STEP);
  assert.equal(step, done % 8);
  assert.equal(bar, Math.floor(done / 8));
  assert.ok(next >= 10 && next < 10 + 0.12 + STEP);
  r.player.stop();
});

test('the last step wraps to the first and the bar moves on', async (t) => {
  t.mock.timers.enable({ apis: ['setInterval'] });
  const r = rig();
  await r.player.start();
  for (let i = 1; i <= 60; i++) { r.at(i * 0.05); t.mock.timers.tick(25); }
  const { step, bar, next } = r.player.phase, done = Math.round((next - 0.06) / STEP);
  assert.ok(done > 8, 'more than one bar scheduled');
  assert.equal(step, done % 8);
  assert.equal(bar, Math.floor(done / 8));
  // a step past its time is shown, and the shown steps run 0..7 and back to 0
  const shown = r.steps.filter((s) => s >= 0);
  assert.ok(shown.includes(7) && shown.lastIndexOf(0) > shown.indexOf(7));
  r.player.stop();
});

test('a STOP while sound is waking up means it never starts', async (t) => {
  t.mock.timers.enable({ apis: ['setInterval'] });
  let release;
  const r = rig({ resume: () => new Promise((ok) => (release = ok)) });
  const starting = r.player.start();
  r.player.stop();
  release();
  await starting;
  assert.equal(r.player.playing, false);
  const after = r.log.length;
  t.mock.timers.tick(1000);
  assert.equal(r.log.length, after, 'no timer is running');
  assert.deepEqual(starts(r.log), []);
});

test('a resume that fails leaves nothing playing and no timer', async (t) => {
  t.mock.timers.enable({ apis: ['setInterval'] });
  const r = rig({ resume: () => Promise.reject(Error('blocked')) });
  await assert.rejects(() => r.player.start(), /blocked/);
  assert.equal(r.player.playing, false);
  const after = r.log.length;
  t.mock.timers.tick(1000);
  assert.equal(r.log.length, after);
});

test('a tapped cell is cut by STOP, and by PLAY taking over', async (t) => {
  t.mock.timers.enable({ apis: ['setInterval'] });
  const r = rig();
  await r.player.hear('note', 0);
  const [audition] = outputs(r.log);
  assert.ok(audition);
  r.player.stop();
  assert.ok(cut(r.log, audition), 'STOP cuts the audition output');
  await r.player.hear('kick', 0);
  const second = outputs(r.log).at(-1);
  await r.player.start();
  assert.ok(cut(r.log, second), 'PLAY cuts the audition before it plays');
  const playing = outputs(r.log).at(-1);
  r.player.stop();
  assert.ok(cut(r.log, playing));
});

test('a tap whose sound wakes after a STOP is not heard', async (t) => {
  t.mock.timers.enable({ apis: ['setInterval'] });
  let release;
  const r = rig({ resume: () => new Promise((ok) => (release = ok)) });
  const hearing = r.player.hear('note', 0);
  r.player.stop();
  release();
  await hearing;
  assert.deepEqual(outputs(r.log), []);
  assert.deepEqual(starts(r.log), []);
});

test('leaving silences everything and lets the context sleep', async (t) => {
  t.mock.timers.enable({ apis: ['setInterval'] });
  const r = rig();
  await r.player.start();
  await r.player.hear('note', 3);
  await r.player.leave();
  for (const id of outputs(r.log)) assert.ok(cut(r.log, id), id);
  assert.ok(r.log.some((e) => e[0] === 'suspend'));
  assert.equal(r.player.modulators, 0);
});
