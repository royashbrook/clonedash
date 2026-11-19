import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deflateRawSync } from 'node:zlib';
import {
  DEGREES, LOOPS, MAX_LOOPS, MAX_LOOP_BYTES, STEPS, addLoop, blankLoop, commitLoops, decodeLoop, deleteLoop,
  emptyLoops, encodeLoop, loopFromSong, loopLink, readLoops, saveLoop, surprise, toggleDrum, toggleNote, validateLoop,
} from '../src/loop.ts';
import { TRACKS } from '../src/music.ts';
import { codeKind, decodeLevel } from '../src/transfer.ts';

// #121, docs/loops.md
const good = () => ({ ...blankLoop(), name: 'Mine', root: 44, wobble: 3, drop: true, notes: [[0, 12], [], [3], [], [22], [], [5, 7], []] });

test('a loop is exactly its eight fields, each in range, or it is refused', () => {
  assert.deepEqual(validateLoop({ ...good(), extra: 1 }), good());
  for (const change of [
    (l) => { l.name = 'x'.repeat(41); }, (l) => { l.name = 3; },
    (l) => { l.root = 35; }, (l) => { l.root = 49; }, (l) => { l.root = 40.5; },
    (l) => { l.wobble = 0; }, (l) => { l.wobble = 9; }, (l) => { l.drop = 1; },
    (l) => { l.notes = l.notes.slice(1); }, (l) => { l.notes[0] = [12, 0]; }, (l) => { l.notes[0] = [0, 0]; },
    (l) => { l.notes[0] = [1]; }, (l) => { l.notes[0] = '0'; },
    (l) => { l.kick = [8]; }, (l) => { l.snare = [4, 2]; }, (l) => { l.hat = [-1]; }, (l) => { delete l.hat; },
  ]) {
    const l = good(); change(l);
    assert.throws(() => validateLoop(l), undefined, JSON.stringify(l));
  }
});

test('every synthesized song is a valid starting loop, and they differ', () => {
  const all = Array.from({ length: TRACKS.length + 100 }, (_, i) => loopFromSong(i));
  assert.equal(new Set(all.map((l) => JSON.stringify(l))).size, all.length);
  for (const l of all) assert.deepEqual(validateLoop(l), l);
});

test('toggles keep notes and drums sorted and distinct; surprise uses the scale', () => {
  let l = blankLoop();
  for (const d of [22, 0, 12]) l = toggleNote(l, 2, d);
  assert.deepEqual(l.notes[2], [0, 12, 22]);
  l = toggleNote(l, 2, 12);
  assert.deepEqual(l.notes[2], [0, 22]);
  l = toggleDrum(l, 'snare', 0);
  assert.deepEqual(l.snare, [0, 4]);
  l = toggleDrum(l, 'kick', 3);
  assert.deepEqual(l.kick, [0, 5]);
  let n = 0;
  const s = surprise(l, () => [0.1, 0.95][n++ % 2]);
  assert.equal(s.notes.length, STEPS);
  assert.ok(s.notes.flat().every((d) => DEGREES.includes(d)));
  assert.deepEqual(validateLoop(s), s);
});

function storage(initial = {}, fail = {}) {
  const map = new Map(Object.entries(initial));
  return {
    map,
    getItem: (k) => (fail.readback && k === LOOPS && map.has(k) && fail.wrote ? 'garbled' : map.has(k) ? map.get(k) : null),
    setItem(k, v) { if (fail.write) throw Error('quota'); map.set(k, v); if (fail.readback) fail.wrote = true; },
  };
}

test('the store adds, saves over and deletes through fresh reads, and refuses rather than drop', () => {
  const s = storage();
  let id;
  commitLoops(s, (x) => { id = addLoop(x, good()); });
  assert.equal(id, 1);
  // another tab added a loop meanwhile: this tab's save keeps it
  const other = readLoops(s.map.get(LOOPS)); addLoop(other, { ...good(), name: 'Other' }); s.map.set(LOOPS, JSON.stringify(other));
  commitLoops(s, (x) => saveLoop(x, id, { ...good(), name: 'Mine 2' }));
  assert.deepEqual(readLoops(s.map.get(LOOPS)).loops.map((e) => e.loop.name), ['Mine 2', 'Other']);
  // saving over a loop deleted elsewhere adds it again
  commitLoops(s, (x) => deleteLoop(x, id));
  commitLoops(s, (x) => saveLoop(x, id, good()));
  assert.deepEqual(readLoops(s.map.get(LOOPS)).loops.map((e) => e.id), [2, 3]);
  // unreadable, full and unconfirmed stores
  const broken = storage({ [LOOPS]: '{nope' });
  assert.throws(() => commitLoops(broken, (x) => addLoop(x, good())), /could not be read/);
  assert.equal(broken.map.get(LOOPS), '{nope');
  assert.throws(() => commitLoops(storage({}, { write: true }), (x) => addLoop(x, good())), /full or blocked/);
  assert.throws(() => commitLoops(storage({}, { readback: true }), (x) => addLoop(x, good())), /could not confirm/);
  const full = emptyLoops(); for (let i = 0; i < MAX_LOOPS; i++) addLoop(full, good());
  assert.throws(() => addLoop(full, good()), /100 loops/);
  for (const bad of [{ version: 2, next: 1, loops: [] }, { version: 1, next: 1, loops: [{ id: 1, loop: good() }] }, { version: 1, next: 3, loops: [{ id: 1, loop: good() }, { id: 1, loop: good() }] }])
    assert.throws(() => readLoops(JSON.stringify(bad)));
});

test('a loop travels as a cdm1 code or #loop= link and comes back equal', async () => {
  const code = await encodeLoop(good());
  assert.ok(code.startsWith('cdm1.'));
  assert.deepEqual(await decodeLoop(code), good());
  const link = loopLink(code, 'https://clonedash.royashbrook.com/?a=1#level=x');
  assert.equal(new URL(link).search, '');
  assert.deepEqual(await decodeLoop(link), good());
  assert.equal(codeKind(code), 'loop'); assert.equal(codeKind(link), 'loop');
  for (const extra of ['level=cdl1.0AA', 'skin=cds1.0AA', 'save=cdb1.0AA', 'loop=cdm1.0AA']) {
    await assert.rejects(() => decodeLoop(link + '&' + extra), /one loop/);
    assert.throws(() => codeKind(link + '&' + extra), /one level, skin, loop or save/);
  }
});

test('loop codes are bounded and refuse wrong or damaged input', async () => {
  await assert.rejects(() => decodeLoop('cds1.0AAAA'), /loop code or link/);
  await assert.rejects(() => decodeLoop('cdm1.2AAAA'), /Invalid loop code/);
  await assert.rejects(() => decodeLoop('cdm1.0AA*A'), /Invalid loop code/);
  await assert.rejects(() => decodeLoop('x'.repeat(192 * 1024 + 1)), /too large/);
  const bomb = deflateRawSync(Buffer.alloc(MAX_LOOP_BYTES + 1, 32));
  await assert.rejects(() => decodeLoop('cdm1.1' + bomb.toString('base64url')), /loop is too large/);
  await assert.rejects(() => decodeLoop('cdm1.0' + Buffer.from(JSON.stringify({ ...good(), root: 99 })).toString('base64url')), /key, wobble or drop/);
});

test('a copy of the game from before loops refuses a loop code and a loop link', async () => {
  const code = await encodeLoop(good());
  // the level decoder is what an older copy hands any code that is not a skin
  await assert.rejects(() => decodeLevel(code), /level code or link/);
  await assert.rejects(() => decodeLevel(loopLink(code, 'https://x.test/')), /does not contain one level/);
});
