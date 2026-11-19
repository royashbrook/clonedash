import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { compose, TRACKS } from '../src/music.ts';
import { graphOf } from './audio-graph.mjs';

// #121: the song voices moved out of compose into a shared module the loop maker plays too. Every
// synthesized song must still build the identical graph, schedule and noise buffer as compose did
// on main 6b7071e, before the move. That baseline is the actual old source, taken from git and run
// in this same process: frequencies come from the JS engine's own maths (2 ** x), whose last bit
// differs between Node versions, so hashes frozen on one runtime cannot judge another. This is
// graph/schedule/buffer-input equality, not PCM equality or a listening check.
const BASELINE = '6b7071e03bd080be63d1a3ebe00cb5524e8cdc91';
const dir = await mkdtemp(join(tmpdir(), 'cube-compose-baseline-'));
await writeFile(join(dir, 'src.tar'), execFileSync('git', ['archive', '--format=tar', BASELINE, 'src']));
execFileSync('tar', ['-xf', join(dir, 'src.tar'), '-C', dir]);
const old = await import(join(dir, 'src', 'music.ts'));
const count = TRACKS.length + 100;

test('every synthesized song builds the same graph, schedule and noise as before the move', async () => {
  assert.equal(old.TRACKS.length + 100, count);
  const differ = [];
  for (let index = 0; index < count; index++)
    if ((await graphOf(compose, index)).hash !== (await graphOf(old.compose, index)).hash) differ.push(index);
  assert.deepEqual(differ, []);
});

test('the record is complete enough to tell songs apart and holds the seeded noise', async () => {
  const hashes = new Set();
  for (let index = 0; index < count; index++) hashes.add((await graphOf(compose, index)).hash);
  assert.equal(hashes.size, count);
  const a = await graphOf(compose, 9), b = await graphOf(compose, 9);
  assert.equal(a.hash, b.hash);
  const samples = a.log.filter((e) => e[0] === 'samples');
  assert.equal(samples.length, 1);
  assert.notEqual(samples[0][2], (await graphOf(compose, 10)).log.find((e) => e[0] === 'samples')[2]);
  for (const kind of ['create', 'set', 'connect', 'start', 'stop', 'setValueAtTime', 'exponentialRampToValueAtTime'])
    assert.ok(a.log.some((e) => e[0] === kind), kind);
});
