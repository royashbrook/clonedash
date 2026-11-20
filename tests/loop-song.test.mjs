import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Soundtrack, composeLoop } from '../src/music.ts';
import { LoopPlayer } from '../src/loop-player.ts';
import { blankLoop } from '../src/loop.ts';
import { object, validateLevel } from '../src/engine.ts';
import { LEVELS } from '../src/levels.ts';
import { readSave, newLevel, storeDraft } from '../src/library.ts';
import { emptyStore } from '../src/skin.ts';
import { checkBackup } from '../src/backup.ts';
import { recorder } from './audio-graph.mjs';

// #121 slice B, a loop as a custom level's song (docs/loops.md). The recorder shows the schedule
// asked for: graph, event and buffer-input equality, not PCM equality or a listening check.
const tune = { ...blankLoop(), name: 'Song loop', root: 43, wobble: 3, drop: true, notes: [[0], [5], [12], [], [7, 22], [], [3], [19]], snare: [2, 6] };
const other = { ...tune, name: 'Other', notes: tune.notes.map((s) => s.map((d) => (d === 22 ? 19 : d))) };
const V1_0_96 = '2ebdb52af056a7c7fb1db8f23e1a2f257f976131';
async function sourceAt(sha) {
  const dir = await mkdtemp(join(tmpdir(), `cube-${sha.slice(0, 7)}-`));
  await writeFile(join(dir, 'src.tar'), execFileSync('git', ['archive', '--format=tar', sha, 'src']));
  execFileSync('tar', ['-xf', join(dir, 'src.tar'), '-C', dir]);
  return join(dir, 'src');
}

// a live player driven by a moved clock for `seconds`, its whole recorded log
async function live(Player, seconds, t, loop = tune) {
  let now = 0;
  const { RecordingContext, log } = recorder({ live: { now: () => now } });
  const player = new Player(() => loop, () => {}, () => new RecordingContext(2, 0, 44100));
  await player.start();
  for (let s = 0.025; s <= seconds; s += 0.025) { now = s; t.mock.timers.tick(25); }
  player.stop();
  return log;
}

test('moving the step out of the player changed nothing it schedules: the 1.0.96 player and this one log the same', async (t) => {
  t.mock.timers.enable({ apis: ['setInterval'] });
  const old = await import(join(await sourceAt(V1_0_96), 'loop-player.ts'));
  assert.deepEqual(await live(LoopPlayer, 8, t), await live(old.LoopPlayer, 8, t));
});

// the per-step events of a log: from the first voice after the echo chain, with ids renamed by first
// appearance, start-time annotations and the live player's own modulator retirement left out
function voiceEvents(log, shift) {
  const first = log.findIndex((e, i) => i > 0 && e[0] === 'connect' && log[i - 1]?.[0] === 'connect' && e[2] === log.find((x) => x[0] === 'create' && x[1].startsWith('compressor'))[1]) + 1;
  const names = new Map(), name = (v) => (typeof v === 'string' && /#\d+/.test(v) ? v.replace(/^[a-z]+#\d+/, (id) => (names.has(id) || names.set(id, `n${names.size}`), names.get(id))) : v);
  return log.slice(first)
    // the noise buffer is made once per chain, before or after the echo; the steps only use it
    .filter((e) => e[0] !== 'disconnect' && !(e[0] === 'stop' && e.length === 2) && e[0] !== 'samples' && e[0] !== 'render' && !(e[0] === 'create' && e[1].startsWith('buffer')))
    .map((e) => {
      const at = e.indexOf('@');
      const kept = at < 0 ? e : e.slice(0, at);
      return kept.map((v, i) => (typeof v === 'number' && i >= 2 && ['start', 'stop', 'setValueAtTime', 'exponentialRampToValueAtTime'].includes(kept[0]) && (kept[0] !== 'setValueAtTime' || i === 3) && (kept[0] !== 'exponentialRampToValueAtTime' || i === 3) ? Math.round((v - shift) * 1e6) / 1e6 : name(v)));
    });
}

test('a loop level plays exactly what PLAY plays: the same events, step for step, for 16 bars', async (t) => {
  t.mock.timers.enable({ apis: ['setInterval'] });
  const { RecordingContext } = recorder();
  const offline = voiceEvents(await composeLoop(tune, RecordingContext), 0);
  const played = voiceEvents(await live(LoopPlayer, 26, t), 0.06);
  assert.ok(offline.length > 1000);
  assert.ok(played.length >= offline.length, 'PLAY scheduled at least the 16 bars');
  assert.deepEqual(played.slice(0, offline.length), offline);
  // and the prefix is all 16 bars, no fewer and no more: 128 steps 0.2 s apart, the last at 25.4 s
  const starts = (log) => log.filter((e) => e[0] === 'start').map((e) => e[2]);
  const steps = (log) => new Set(starts(log).map((t) => Math.round(t / 0.2)));
  assert.deepEqual([...steps(offline)].sort((a, b) => a - b), Array.from({ length: 128 }, (_, i) => i));
  assert.ok(starts(offline).every((t) => t < 25.6));
  assert.ok(starts(played.slice(offline.length)).every((t) => t >= 25.6), 'nothing PLAY scheduled before 25.6 s is missing');
  // and it is the loop's music, not a song's: a different loop builds a different log
  assert.notDeepEqual(voiceEvents(await composeLoop(other, RecordingContext), 0), offline);
});

test('a 16 step loop (#140): PLAY and the level song play the same events, step for step, wrapping at 16', async (t) => {
  t.mock.timers.enable({ apis: ['setInterval'] });
  const { RecordingContext } = recorder();
  const long = { ...tune, notes: [...tune.notes, [], [], [], [12], [], [], [], [22]], kick: [0, 4, 15], hat: [1, 9] };
  const offline = voiceEvents(await composeLoop(long, RecordingContext), 0);
  const played = voiceEvents(await live(LoopPlayer, 26, t, long), 0.06);
  assert.ok(played.length >= offline.length);
  assert.deepEqual(played.slice(0, offline.length), offline);
  assert.notDeepEqual(offline, voiceEvents(await composeLoop(tune, RecordingContext), 0), 'steps 9 to 16 sound');
});

// ---- the soundtrack: one render at a time, keyed by what it sounds like ----

function rig() {
  const renders = [], started = [];
  const { RecordingContext, log } = recorder();
  // each render waits until the test says how it ends, and keeps where its recorded calls end
  globalThis.OfflineAudioContext = class extends RecordingContext {
    startRendering() {
      return new Promise((ok, fail) => renders.push({ ok: () => ok({ duration: 25.6 }), fail, upto: log.length }));
    }
  };
  const music = new Soundtrack();
  music.enabled = true;
  music.context = {
    destination: {},
    close: async () => {},
    createBufferSource: () => ({ connect() {}, disconnect() {}, stop() {}, start() { started.push(this.buffer); }, loop: false, buffer: null }),
  };
  return { music, renders, started, log };
}
const settle = () => new Promise((r) => setImmediate(r));

test('a render that finishes after the level changed only fills the cache, and the new level plays', async () => {
  const { music, renders, started } = rig();
  music.sync(structuredClone(tune), true, 0);
  music.sync(structuredClone(other), true, 0); // switched while the first renders: no second render yet
  assert.equal(renders.length, 1);
  renders[0].ok(); await settle();
  assert.deepEqual(started, []);
  assert.equal(renders.length, 2, 'then the chosen level renders');
  renders[1].ok(); await settle();
  assert.equal(started.length, 1);
  assert.equal(music.buffers.size, 1);
  assert.ok([...music.buffers.keys()][0].includes('"Other"'));
});

test('a failure for music no longer wanted does not silence the music that is', async () => {
  const { music, renders, started } = rig();
  music.sync(structuredClone(tune), true, 0);
  music.sync(structuredClone(other), true, 0);
  renders[0].fail(Error('no')); await settle();
  assert.equal(music.enabled, true);
  assert.equal(renders.length, 2);
  renders[1].ok(); await settle();
  assert.equal(started.length, 1);
  // a failure for the music still wanted does turn it off
  const b = rig();
  b.music.sync(structuredClone(tune), true, 0);
  b.renders[0].fail(Error('no')); await settle();
  assert.equal(b.music.enabled, false);
});

test('hiding the page drops the wish to play, so a render finishing while hidden stays silent', async () => {
  const { music, renders, started } = rig();
  music.sync(structuredClone(tune), true, 0);
  music.interrupt();
  renders[0].ok(); await settle();
  assert.deepEqual(started, []);
  // the next frame that wants music plays it from the cache
  music.sync(structuredClone(tune), true, 0);
  assert.equal(started.length, 1);
});

test('the music renders as it was when asked for, and two levels with equal ids but different loops never share a buffer', async () => {
  const { music, renders, started, log } = rig();
  const asked = structuredClone(tune);
  music.sync(asked, true, 0);
  asked.notes[0] = [22]; // the level changes while its song renders
  // what rendered is the loop as it was asked for
  const { RecordingContext } = recorder();
  const expected = (await composeLoop(structuredClone(tune), RecordingContext)).filter((e) => e[0] !== 'samples' && e[0] !== 'render');
  assert.deepEqual(log.slice(0, renders[0].upto), expected);
  renders[0].ok(); await settle();
  assert.ok([...music.buffers.keys()][0].includes(JSON.stringify(tune.notes)));
  // the changed level is different music: it renders again instead of reusing that buffer
  assert.equal(renders.length, 2);
  assert.deepEqual(started, []);
  renders[1].ok(); await settle();
  assert.equal(started.length, 1);
  assert.ok([...music.buffers.keys()][0].includes(JSON.stringify(asked.notes)));
});

// ---- the level's loop on the way in ----

test("a level's loop is bounded on what arrived, before its check could drop the extra", () => {
  const base = { name: 'Mine', length: 60, objects: [object('block', 6, 0)] };
  assert.doesNotThrow(() => validateLevel({ ...base, loop: tune }));
  assert.throws(() => validateLevel({ ...base, loop: { ...tune, pad: 'x'.repeat(9000) } }), /settings/);
});

test("a whole save checks a level's loop field by field, before any reader can drop one", () => {
  const save = readSave(null, LEVELS.length), level = newLevel(save);
  storeDraft(save, { ...level, song: undefined, loop: tune });
  const data = { v: 1, game: JSON.parse(JSON.stringify(readSave(JSON.stringify(save), LEVELS.length))), skins: emptyStore() };
  assert.doesNotThrow(() => checkBackup(data, LEVELS.length));
  for (const where of [(d) => d.game.draft, (d) => d.game.customLevels.at(-1).level]) {
    const bad = structuredClone(data);
    where(bad).loop.tempo = 140;
    // a predicate, so a refusal for the wrong reason fails as an assertion, not as that error
    assert.throws(() => checkBackup(bad, LEVELS.length), (e) => /newer Cube Dash/.test(e.message));
  }
});
