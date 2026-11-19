import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { compose, TRACKS } from '../src/music.ts';
import { graphOf } from './audio-graph.mjs';

// #121: the song voices moved out of compose into a shared module the loop maker plays too. Every
// synthesized song must still build the identical graph, schedule and noise buffer as on the
// frozen baseline (scripts/freeze-compose-graph.mjs, tests/fixtures/compose-graph.json). This is
// graph/schedule/buffer-input equality, not PCM equality or a listening check.
const frozen = JSON.parse(await readFile(new URL('./fixtures/compose-graph.json', import.meta.url), 'utf8'));

test('every synthesized song builds the frozen graph, schedule and noise', async () => {
  const count = TRACKS.length + 100, differ = [];
  assert.equal(Object.keys(frozen.songs).length, count);
  for (let index = 0; index < count; index++)
    if ((await graphOf(compose, index)).hash !== frozen.songs[index]) differ.push(index);
  assert.deepEqual(differ, []);
});

test('the record is complete enough to tell songs apart and holds the seeded noise', async () => {
  assert.equal(new Set(Object.values(frozen.songs)).size, TRACKS.length + 100);
  const a = await graphOf(compose, 9), b = await graphOf(compose, 9);
  assert.equal(a.hash, b.hash);
  const samples = a.log.filter((e) => e[0] === 'samples');
  assert.equal(samples.length, 1);
  assert.notEqual(samples[0][2], (await graphOf(compose, 10)).log.find((e) => e[0] === 'samples')[2]);
  for (const kind of ['create', 'set', 'connect', 'start', 'stop', 'setValueAtTime', 'exponentialRampToValueAtTime'])
    assert.ok(a.log.some((e) => e[0] === kind), kind);
});
