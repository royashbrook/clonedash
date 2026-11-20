import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { blankLoop, resize, cutLoses, validateLoop, LENGTHS, encodeLoop, decodeLoop } from '../src/loop.ts';
import { composeLoop, loopSongSteps } from '../src/music.ts';
import { LoopPlayer } from '../src/loop-player.ts';
import { validateLevel, object } from '../src/engine.ts';
import { recorder } from './audio-graph.mjs';

// Loops from 8 to 32 steps (#140, docs/loops.md). A bar stays 8 steps; the loop wraps at its length.
const long = (n) => {
  const l = resize({ ...blankLoop(), name: 'Long', root: 43, wobble: 3 }, n);
  l.notes = l.notes.map(() => []);
  l.notes[0] = [0];
  if (n > 11) l.notes[11] = [12]; // past step 8
  l.notes[n - 1] = [22];       // the last step
  l.kick = [0, n - 1];
  return validateLoop(l);
};

test('a loop is 8, 16, 24 or 32 steps; anything else, or a drum past its end, is refused', () => {
  assert.deepEqual(LENGTHS, [8, 16, 24, 32]);
  for (const n of LENGTHS) assert.equal(validateLoop(long(n)).notes.length, n);
  for (const n of [0, 7, 9, 12, 40]) assert.throws(() => validateLoop({ ...blankLoop(), notes: Array.from({ length: n }, () => []) }), /notes/);
  assert.throws(() => validateLoop({ ...long(16), hat: [16] }), /drums/);
});

test('growing appends silent steps and keeps everything; cutting asks only when it loses something', () => {
  const eight = { ...blankLoop(), root: 44, wobble: 5, drop: true, notes: [[0], [], [3], [], [], [], [], [22]], kick: [0, 7], snare: [2], hat: [1, 3] };
  const grown = resize(eight, 16);
  assert.deepEqual(grown.notes.slice(0, 8), eight.notes);
  assert.deepEqual(grown.notes.slice(8), Array(8).fill([]));
  for (const k of ['root', 'wobble', 'drop', 'kick', 'snare', 'hat']) assert.deepEqual(grown[k], eight[k]);
  assert.deepEqual(resize(grown, 8), eight, 'cutting the silent steps gives the loop back');
  assert.equal(cutLoses(grown, 8), false);
  assert.equal(cutLoses({ ...grown, notes: grown.notes.map((s, i) => (i === 9 ? [5] : s)) }, 8), true);
  assert.equal(cutLoses({ ...grown, snare: [2, 12] }, 8), true);
});

test('a long loop travels as a cdm1 code and comes back exactly', async () => {
  for (const n of LENGTHS) assert.deepEqual(await decodeLoop(await encodeLoop(long(n))), long(n));
});

test('a copy of the game from before long loops refuses one, in a loop and in a level, instead of cutting it', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'cube-7cc7e60-'));
  await writeFile(join(dir, 'src.tar'), execFileSync('git', ['archive', '--format=tar', '7cc7e6000527290402e9f74a78061b1a276540ca', 'src']));
  execFileSync('tar', ['-xf', join(dir, 'src.tar'), '-C', dir]);
  const old = await import(join(dir, 'src', 'loop-schema.ts'));
  const oldEngine = await import(join(dir, 'src', 'engine.ts'));
  assert.doesNotThrow(() => old.validateLoop(long(8)));
  for (const n of [16, 24, 32]) {
    assert.throws(() => old.validateLoop(long(n)), /notes/);
    assert.throws(() => oldEngine.validateLevel({ name: 'L', length: 60, objects: [object('block', 6, 0)], loop: long(n) }));
  }
  assert.doesNotThrow(() => validateLevel({ name: 'L', length: 60, objects: [object('block', 6, 0)], loop: long(32) }));
});

test('a level song renders whole passes of the loop and of the chord cycle', () => {
  assert.deepEqual(LENGTHS.map(loopSongSteps), [128, 128, 192, 128]);
});

// the per-step lead events (time, pitch) of a recorded log, shifted
const leads = (log, shift) => {
  const starts = [], freq = new Map();
  for (const e of log) {
    if (e[0] === 'set' && e[2] === 'frequency') freq.set(e[1], e[3]);
    if (e[0] === 'start' && e[1].startsWith('oscillator')) starts.push([Math.round((e[2] - shift) * 1e6) / 1e6, e[1]]);
  }
  return starts.map(([t]) => t);
};

test('a 16 step loop level song sounds step 12 and the last step in every pass', async () => {
  const { RecordingContext } = recorder();
  const loop = long(16);
  const offline = await composeLoop(loop, RecordingContext);
  // the render is 128 steps long (25.6 s), so the loop plays 8 whole times
  const render = offline.find((e) => e[0] === 'render' || e[0] === 'create' && e[1].startsWith('offline'));
  assert.ok(offline.length > 1000);
  // a note on step 12 sounds at 12 x 0.2 s into each pass
  const kicks = (log, shift) => leads(log, shift);
  const off = kicks(offline, 0);
  for (const pass of [0, 1, 7]) assert.ok(off.some((x) => Math.abs(x - (pass * 16 + 11) * 0.2) < 1e-6), `step 12 in pass ${pass + 1}`);
  for (const pass of [0, 1, 7]) assert.ok(off.some((x) => Math.abs(x - (pass * 16 + 15) * 0.2) < 1e-6), `the last step in pass ${pass + 1}`);
  void render;
});
