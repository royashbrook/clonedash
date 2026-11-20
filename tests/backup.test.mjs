import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deflateRawSync } from 'node:zlib';
import { BACKUP_PREFIX, IMPORT, MAX_BACKUP_BYTES, backupLink, checkBackup, decodeBackup, encodeBackup, summary, writeBackup } from '../src/backup.ts';
import { TYPES, object } from '../src/engine.ts';
import { LEVELS } from '../src/levels.ts';
import { SAVE, newLevel, readSave, storeDraft } from '../src/library.ts';
import { SKINS, addSkin, emptyStore, readSkins, wearSkin } from '../src/skin.ts';
import { MAX_CODE, MAX_SAVE_TEXT, codeKind, unpackCode } from '../src/transfer.ts';

// #124, a whole save moving between devices. docs: notes in src/backup.ts.
const N = LEVELS.length;
const skin = (name, fill = '1') => ({ name, width: 4, height: 4, palette: ['#ffd166'], pixels: fill.repeat(16) });

// everything a player can have: progress and coins on built-in levels, sound, several custom
// levels with coins and every piece type (round 3 width/height, touch and multi included), a draft
// that is the active level, and skins with one worn
function fullSave(types = TYPES) {
  const game = readSave(null, N);
  game.best = { 0: 100, 3: 47 }; game.coins = { 0: 2 }; game.sound = true;
  const level = newLevel(game);
  level.name = 'Everything'; level.length = 120;
  level.objects = types.map((t, i) => object(t, 4 + i * 1.5, 0));
  level.objects.push({ ...object('grid', 8, 1), scaleX: 2, scaleY: 0.5 });
  level.objects.push({ ...object('ring', 9, 2), multi: true });
  level.objects.push({ ...object('move-trigger', 10, 0), touch: true, multi: true });
  storeDraft(game, level);
  game.customLevels[0].coins = 1;
  newLevel(game);
  const skins = emptyStore();
  addSkin(skins, skin('One')); const worn = addSkin(skins, skin('Two', '1')); addSkin(skins, skin('Blank', '0'));
  wearSkin(skins, worn);
  return { game: readSave(JSON.stringify(game), N), skins: readSkins(JSON.stringify(skins)) };
}

test('a full save round-trips exactly, as a code and as a link', async () => {
  const save = fullSave(), code = await encodeBackup(save, N);
  assert.ok(code.startsWith(BACKUP_PREFIX));
  assert.deepEqual(await decodeBackup(code, N), save);
  const link = backupLink(code, 'https://clonedash.royashbrook.com/?x=1#level=old');
  assert.equal(new URL(link).search, '');
  assert.deepEqual(await decodeBackup(link, N), save);
  assert.equal(codeKind(code), 'save'); assert.equal(codeKind(link), 'save');
  assert.deepEqual(summary(save), { played: 2, levels: 3, skins: 3, loops: 0 });
});

test('a fresh device save round-trips too', async () => {
  const save = { game: readSave(null, N), skins: readSkins(null) };
  assert.deepEqual(await decodeBackup(await encodeBackup(save, N), N), save);
});

const raw = (data) => BACKUP_PREFIX + '0' + Buffer.from(JSON.stringify(data)).toString('base64url');
const refuses = async (change, pattern) => {
  const data = { v: 1, ...structuredClone(fullSave()) }; change(data);
  await assert.rejects(() => decodeBackup(raw(data), N), pattern);
  assert.throws(() => checkBackup(data, N), pattern);
};

test('every field is one this version knows, of its type: unknown parts say update, wrong ones say damaged', async () => {
  await refuses((d) => { d.music = { version: 1 }; }, /newer Cube Dash/);
  await refuses((d) => { d.loops = { version: 1 }; }, /damaged/);
  await refuses((d) => { d.v = 2; }, /newer Cube Dash/);
  await refuses((d) => { d.v = '1'; }, /damaged/);
  await refuses((d) => { d.game.futureField = {}; }, /newer Cube Dash/);
  await refuses((d) => { d.game.customLevels[0].futureField = 1; }, /newer Cube Dash/);
  await refuses((d) => { d.skins.futureField = 1; }, /newer Cube Dash/);
  await refuses((d) => { d.skins.skins[0].futureField = 1; }, /newer Cube Dash/);
  await refuses((d) => { d.game.sound = 'not-a-boolean'; }, /damaged/);
  await refuses((d) => { d.game.activeLevel = '1'; }, /damaged/);
  await refuses((d) => { delete d.game.draft; }, /damaged/);
  await refuses((d) => { delete d.skins; }, /damaged/);
  await refuses((d) => { d.game.best = { 0: 101 }; }, /damaged/);
  await refuses((d) => { d.skins.selected = 3; }, /damaged/); // the blank skin can't be worn
  // a reader that would drop or rewrite something: an unknown piece field, a draft out of step
  // readSave keeps a piece or level field it does not know; the share whitelist catches it
  await refuses((d) => { d.game.customLevels[1].level.objects[0].wobble = 1; }, /newer Cube Dash/);
  await refuses((d) => { d.game.customLevels[0].level.objects.push({ ...object('grid', 9, 0), wobble: 1 }); }, /newer Cube Dash/);
  await refuses((d) => { d.game.customLevels[0].level.future = 1; }, /newer Cube Dash/);
  await refuses((d) => { d.game.draft.name = 'Different'; }, /damaged/);
});

test('equality is structure, not key order', () => {
  const data = { v: 1, ...fullSave() };
  const reordered = { skins: data.skins, game: Object.fromEntries(Object.entries(data.game).reverse()), v: 1 };
  assert.deepEqual(checkBackup(reordered, N), checkBackup(data, N));
});

test('codes, links and bounds fail with plain words and never decode past a bound', async () => {
  await assert.rejects(() => decodeBackup('cdb2.0AAAA', N), /newer Cube Dash/);
  await assert.rejects(() => decodeBackup('cdl1.0AAAA', N), /save code or link/);
  await assert.rejects(() => decodeBackup('cdb1.2AAAA', N), /Invalid save code/);
  await assert.rejects(() => decodeBackup('cdb1.0AA*A', N), /Invalid save code/);
  await assert.rejects(() => decodeBackup('cdb1.0' + Buffer.from('{not json').toString('base64url'), N), /damaged/);
  await assert.rejects(() => decodeBackup('x'.repeat(Math.ceil(MAX_BACKUP_BYTES * 4 / 3) + 1025), N), /too large/);
  // an inflation bomb stops at the bound while inflating
  const bomb = deflateRawSync(Buffer.alloc(MAX_BACKUP_BYTES + 1, 32));
  await assert.rejects(() => decodeBackup(BACKUP_PREFIX + '1' + bomb.toString('base64url'), N), /save is too large/);
  const link = backupLink(await encodeBackup(fullSave(), N), 'https://x.test/');
  for (const extra of ['level=cdl1.0AA', 'skin=cds1.0AA', 'save=cdb1.0AA'])
    await assert.rejects(() => decodeBackup(link + '&' + extra, N), /one save/);
  assert.throws(() => codeKind(link + '&level=cdl1.0AA'), /one level, skin, loop or save/);
  assert.throws(() => codeKind(link + '&loop=cdm1.0AA'), /one level, skin, loop or save/);
  await assert.rejects(() => decodeBackup(link + '&loop=cdm1.0AA', N), /one save/);
});

test('a large library stays movable as a code', async () => {
  const game = readSave(null, N);
  for (let i = 1; i < 100; i++) {
    const level = newLevel(game); level.length = 400;
    level.objects = Array.from({ length: 150 }, (_, j) => object(TYPES[j % TYPES.length], 4 + j * 2.5, j % 3));
    storeDraft(game, level);
  }
  const skins = emptyStore();
  for (let i = 0; i < 100; i++) addSkin(skins, { name: `S${i}`, width: 100, height: 100, palette: ['#ffd166', '#06d6a0'], pixels: String(i % 3).repeat(9999) + '2' });
  const save = { game: readSave(JSON.stringify(game), N), skins: readSkins(JSON.stringify(skins)) };
  const code = await encodeBackup(save, N);
  assert.deepEqual(await decodeBackup(code, N), save);
});

// a Storage whose calls can be made to fail: per key, on the nth write, or on readback
function storage(initial = {}, fail = {}) {
  const map = new Map(Object.entries(initial)), log = [];
  let writes = 0, garble = false;
  return {
    map, log,
    // a readback failure: the first read after writing that key comes back wrong, once
    getItem(k) {
      if (garble && k === fail.readback) { garble = false; return 'garbled'; }
      return map.has(k) ? map.get(k) : null;
    },
    setItem(k, v) {
      writes++;
      if (fail.write?.(k, writes, v)) throw Error(`quota ${k}`);
      map.set(k, String(v)); log.push('wrote ' + k);
      if (k === fail.readback && !log.includes('garbled ' + k)) { garble = true; log.push('garbled ' + k); }
    },
    removeItem(k) { if (fail.remove === k) throw Error('remove'); map.delete(k); },
  };
}
const OLD = { [SAVE]: JSON.stringify(readSave(null, N)) }; // an old device with no skins key at all

test('replace writes both stores, reads them back, then marks the load done', () => {
  const s = storage(OLD), save = fullSave();
  writeBackup(s, save, N);
  assert.deepEqual(readSave(s.map.get(SAVE), N), save.game);
  assert.deepEqual(readSkins(s.map.get(SKINS)), save.skins);
  assert.equal(JSON.parse(s.map.get(IMPORT)).state, 'done');
});

test('any failed write or readback puts both stores back exactly, absent keys stay absent', () => {
  const save = fullSave();
  for (const fail of [
    { write: (k) => k === IMPORT },               // before anything
    { write: (k) => k === SAVE },                 // first store
    { write: (k) => k === SKINS },                // second store, after the first succeeded
    { readback: SKINS },                          // wrote, but does not read back
  ]) {
    const s = storage(OLD, fail);
    assert.throws(() => writeBackup(s, save, N), /Nothing was changed|quota/);
    assert.equal(s.map.get(SAVE), OLD[SAVE]);
    assert.equal(s.map.has(SKINS), false);
    assert.equal(s.map.has(IMPORT), false);
  }
});

test('a rollback that fails names what may be new and leaves the load marked pending', () => {
  const save = fullSave();
  let saves = 0;
  // the level save writes, the skins fail, and putting the old level save back fails too
  const s = storage(OLD, { write: (k) => k === SKINS || (k === SAVE && ++saves > 1) });
  assert.throws(() => writeBackup(s, save, N), /your levels and progress may be from the new save/);
  assert.equal(JSON.parse(s.map.get(IMPORT)).state, 'pending');
  // an old key that was absent and cannot be removed again is named too
  const r = storage({}, { write: (k) => k === SKINS, remove: SAVE });
  assert.throws(() => writeBackup(r, save, N), /your levels and progress may be from the new save/);
});

test('the done marker failing is reported as not finished, and pending stays as the signal', () => {
  const s = storage(OLD, { write: (k, n, v) => k === IMPORT && String(v).includes('done') }), save = fullSave();
  assert.throws(() => writeBackup(s, save, N), /ran out of room before it finished/);
  assert.equal(JSON.parse(s.map.get(IMPORT)).state, 'pending');
});

test('the writer checks the whole save itself and writes nothing for a bad one', () => {
  for (const change of [(b) => { b.skins.skins[0].skin.pixels = 'x'; }, (b) => { b.game.sound = 'yes'; }, (b) => { b.game.future = 1; }]) {
    const s = storage(OLD), bad = fullSave(); change(bad);
    assert.throws(() => writeBackup(s, bad, N), /damaged|newer/);
    assert.deepEqual([...s.map.keys()], [SAVE]);
    assert.equal(s.map.get(SAVE), OLD[SAVE]);
  }
});

test('a failed load puts an earlier marker back exactly', () => {
  const earlier = JSON.stringify({ state: 'done', id: 'earlier' });
  const s = storage({ ...OLD, [IMPORT]: earlier }, { write: (k) => k === SKINS });
  assert.throws(() => writeBackup(s, fullSave(), N), /Nothing was changed/);
  assert.equal(s.map.get(IMPORT), earlier);
});

test('no text past the whole-save ceiling is parsed as a link, and only a save passes a level cap', () => {
  const real = globalThis.URL;
  let built = 0;
  globalThis.URL = class extends real { constructor(...a) { built++; super(...a); } };
  try {
    const huge = 'https://x.test/#save=' + 'A'.repeat(MAX_SAVE_TEXT);
    assert.throws(() => codeKind(huge), /too large/);
    assert.equal(built, 0);
  } finally {
    globalThis.URL = real;
  }
  const levelSized = 'https://x.test/#level=' + 'A'.repeat(MAX_CODE);
  assert.throws(() => codeKind(levelSized), /too large/);
  assert.equal(codeKind('https://x.test/#save=' + 'A'.repeat(MAX_CODE)), 'save');
});

test('every load leaves a marker no earlier load left', () => {
  const s = storage(OLD), seen = new Set();
  for (let i = 0; i < 5; i++) { writeBackup(s, fullSave(), N); seen.add(s.map.get(IMPORT)); }
  assert.equal(seen.size, 5);
});

// ---- loops in a whole save (#121, docs/loops.md) ----
import { execFileSync } from 'node:child_process';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LOOPS, addLoop, blankLoop, emptyLoops, readLoops } from '../src/loop.ts';

const tune = (name) => ({ ...blankLoop(), name, notes: [[0], [], [12], [], [7], [], [3], []] });
function withLoops() {
  const loops = emptyLoops(); addLoop(loops, tune('A')); addLoop(loops, tune('B'));
  return { ...fullSave(), loops: readLoops(JSON.stringify(loops)) };
}

test('loops travel in a save and come back equal; a save without loops is the same bytes as before', async () => {
  const save = withLoops();
  assert.deepEqual(await decodeBackup(await encodeBackup(save, N), N), save);
  assert.equal(summary(save).loops, 2);
  const plain = fullSave(), code = await encodeBackup(plain, N);
  const json = JSON.parse(await unpackCode(code, BACKUP_PREFIX, MAX_BACKUP_BYTES, 'save'));
  assert.deepEqual(Object.keys(json), ['v', 'game', 'skins']);
  assert.equal(JSON.stringify(json), JSON.stringify({ v: 1, ...plain }));
});

test('a loop field this version does not know is refused before any reader can drop it', async () => {
  for (const [change, words] of [
    [(d) => { d.loops.loops[0].loop.tempo = 140; }, /newer Cube Dash/],
    [(d) => { d.loops.loops[0].colour = 1; }, /newer Cube Dash/],
    [(d) => { d.loops.future = 1; }, /newer Cube Dash/],
    [(d) => { delete d.loops.loops[0].loop.hat; }, /damaged/],
    [(d) => { d.loops.loops[0].loop.root = 99; }, /damaged/],
    [(d) => { d.loops.next = 1; }, /damaged/],
  ]) {
    const data = { v: 1, ...structuredClone(withLoops()) }; change(data);
    await assert.rejects(() => decodeBackup(raw(data), N), words);
    assert.throws(() => checkBackup(data, N), words);
  }
});

test('loading replaces this device\'s loops: absent removes them, an empty store keeps its numbers', () => {
  const had = { ...OLD, [LOOPS]: JSON.stringify(withLoops().loops) };
  const s = storage(had);
  assert.doesNotThrow(() => writeBackup(s, fullSave(), N));
  assert.equal(s.map.has(LOOPS), false);
  const empty = { version: 1, next: 7, loops: [] }, e = storage(had);
  assert.doesNotThrow(() => writeBackup(e, { ...fullSave(), loops: empty }, N));
  assert.deepEqual(JSON.parse(e.map.get(LOOPS)), empty);
  const w = storage(OLD);
  assert.doesNotThrow(() => writeBackup(w, withLoops(), N));
  assert.deepEqual(readLoops(w.map.get(LOOPS)), withLoops().loops);
});

test('a failed third write or read-back puts every store back exactly, absent stays absent', () => {
  const had = { ...OLD, [LOOPS]: JSON.stringify(withLoops().loops) };
  for (const [initial, save, fail] of [
    [OLD, withLoops(), { write: (k) => k === LOOPS }],
    [OLD, withLoops(), { readback: LOOPS }],
    [had, fullSave(), { remove: LOOPS }],
  ]) {
    const s = storage(initial, fail);
    assert.throws(() => writeBackup(s, save, N), /Nothing was changed|remove|quota/);
    for (const key of [SAVE, SKINS, LOOPS]) assert.equal(s.map.get(key), initial[key], key);
    assert.equal(s.map.has(LOOPS), LOOPS in initial);
  }
  // the loops fail and putting the skins back fails too: the error names the skins
  let skins = 0;
  const p = storage(OLD, { write: (k) => k === LOOPS || (k === SKINS && ++skins > 1), remove: SKINS });
  assert.throws(() => writeBackup(p, withLoops(), N), /your skins may be from the new save/);
  assert.equal(JSON.parse(p.map.get(IMPORT)).state, 'pending');
});

test('the 1.0.85 reader itself refuses a save that carries loops', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'cube-1085-'));
  await writeFile(join(dir, 'src.tar'), execFileSync('git', ['archive', '--format=tar', '6b7071e03bd080be63d1a3ebe00cb5524e8cdc91', 'src']));
  execFileSync('tar', ['-xf', join(dir, 'src.tar'), '-C', dir]);
  const old = await import(join(dir, 'src', 'backup.ts'));
  // Isolate the loop field: use only pieces this archived reader could have authored.
  const { TYPES: oldTypes } = await import(join(dir, 'src', 'engine.ts'));
  const plain = fullSave(oldTypes);
  const code = await encodeBackup({ ...plain, loops: withLoops().loops }, N);
  await assert.rejects(() => old.decodeBackup(code, N), /newer Cube Dash/);
  // and still opens one without them
  assert.deepEqual(await old.decodeBackup(await encodeBackup(plain, N), N), plain);
});
