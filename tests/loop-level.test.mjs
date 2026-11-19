import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deflateRawSync } from 'node:zlib';
import { execFileSync } from 'node:child_process';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { object, validateLevel } from '../src/engine.ts';
import { LEVELS } from '../src/levels.ts';
import { newLevel, readSave, selectLevel, storeDraft } from '../src/library.ts';
import { blankLoop } from '../src/loop.ts';
import { decodeLevel, encodeLevel, levelLink, portableLevel } from '../src/transfer.ts';
import { decodeBackup, encodeBackup } from '../src/backup.ts';
import { emptyStore } from '../src/skin.ts';

// #121 slice B: a custom level's song can be its own loop. docs/loops.md "A loop as a level's song".
const N = LEVELS.length;
const tune = { ...blankLoop(), name: 'Level tune', root: 44, wobble: 3, notes: [[0], [], [12], [], [7], [], [3], []] };
const base = { name: 'Mine', length: 60, objects: [object('block', 6, 0), object('spike', 9, 0)] };
const withLoop = { ...base, loop: tune };
const wide = { ...base, objects: [...base.objects, { ...object('grid', 12, 1), scaleX: 2, scaleY: 0.5 }] };

// older copies of the game, as they really were: before round 3 and the 1.0.96 release
async function sourceAt(sha) {
  const dir = await mkdtemp(join(tmpdir(), `cube-${sha.slice(0, 7)}-`));
  await writeFile(join(dir, 'src.tar'), execFileSync('git', ['archive', '--format=tar', sha, 'src']));
  execFileSync('tar', ['-xf', join(dir, 'src.tar'), '-C', dir]);
  return join(dir, 'src');
}
const PRE_118 = '0c24a1aa90423a8d29d284059ad361ae5d615c36', V1_0_96 = '2ebdb52af056a7c7fb1db8f23e1a2f257f976131';
const code = (prefix, data, compressed) => {
  const bytes = Buffer.from(JSON.stringify(data));
  return prefix + (compressed ? '1' + deflateRawSync(bytes).toString('base64url') : '0' + bytes.toString('base64url'));
};

test('a level has one song source: its own loop or a numbered song, never both', () => {
  const level = validateLevel({ ...withLoop, loop: { ...tune, extra: 1 } });
  assert.deepEqual(level.loop, tune);
  assert.throws(() => validateLevel({ ...withLoop, song: 9 }), /settings/);
  assert.throws(() => validateLevel({ ...base, loop: { ...tune, root: 99 } }), /key, wobble or drop/);
  assert.throws(() => validateLevel({ ...base, loop: null }));
  const portable = portableLevel(withLoop);
  assert.deepEqual(portable.loop, tune);
  assert.equal('song' in portable, false);
  assert.equal(portableLevel(base).song, 9);
});

test('a loop level travels as cdl3, any geometry, and comes back equal', async () => {
  for (const level of [withLoop, { ...wide, loop: tune }]) {
    const c = await encodeLevel(level);
    assert.ok(c.startsWith('cdl3.'), c.slice(0, 5));
    assert.deepEqual(await decodeLevel(c), portableLevel(level));
    assert.deepEqual(await decodeLevel(levelLink(c, 'https://x.test/')), portableLevel(level));
  }
});

test('a level without a loop is the same bytes the 1.0.96 writer made', async () => {
  const old = await import(join(await sourceAt(V1_0_96), 'transfer.ts'));
  for (const level of [base, wide, { ...base, song: 3, height: 9, note: 'hi', color: '#123456' }]) {
    const now = await encodeLevel(level);
    assert.equal(now, await old.encodeLevel(level));
    assert.ok(/^cdl[12]\./.test(now));
  }
});

test('a loop under cdl1 or cdl2 is refused before anything could drop it, and cdl3 needs one', async () => {
  for (const compressed of [false, true]) {
    for (const loop of [tune, null, { nope: 1 }, 'x'])
      for (const [prefix, level] of [['cdl1.', base], ['cdl2.', wide]])
        await assert.rejects(() => decodeLevel(code(prefix, { ...portableLevel(level), loop }, compressed)), /Invalid level code/, `${prefix} ${JSON.stringify(loop)}`);
    await assert.rejects(() => decodeLevel(code('cdl3.', portableLevel(base), compressed)), /Invalid level code/);
    await assert.rejects(() => decodeLevel(code('cdl3.', { ...portableLevel(withLoop), song: 9 }, compressed)), /settings/);
    await assert.rejects(() => decodeLevel(code('cdl3.', { ...portableLevel(withLoop), loop: { ...tune, wobble: 0 } }, compressed)), /key, wobble or drop/);
  }
});

test('the actual copies from before round 3 and from 1.0.96 refuse a loop level, raw and compressed', async () => {
  for (const sha of [PRE_118, V1_0_96]) {
    const old = await import(join(await sourceAt(sha), 'transfer.ts'));
    for (const compressed of [false, true]) {
      const c = code('cdl3.', portableLevel(withLoop), compressed);
      await assert.rejects(() => old.decodeLevel(c), /level code or link/, sha);
      await assert.rejects(() => old.decodeLevel(levelLink(c, 'https://x.test/')), /level code or link/, sha);
    }
    // and an old reader shown a loop smuggled into cdl1 would drop it, which is why none is ever written
    const smuggled = await old.decodeLevel(code('cdl1.', { ...portableLevel(base), loop: tune }, false));
    assert.equal(smuggled.loop, undefined);
  }
});

test('a loop level keeps its loop through the save, selection, drafts and a whole save', async () => {
  const save = readSave(null, N);
  const level = newLevel(save);
  storeDraft(save, { ...level, song: undefined, loop: tune });
  let read = readSave(JSON.stringify(save), N);
  assert.deepEqual(read.draft.loop, tune);
  assert.equal('song' in read.draft, false);
  newLevel(read);
  assert.deepEqual(selectLevel(read, 2).loop, tune);
  const backup = { game: readSave(JSON.stringify(read), N), skins: emptyStore() };
  assert.deepEqual(await decodeBackup(await encodeBackup(backup, N), N), backup);
  // 1.0.96's own whole-save reader refuses a save holding a loop level rather than drop the loop
  const old = await import(join(await sourceAt(V1_0_96), 'backup.ts')), saved = await encodeBackup(backup, N);
  await assert.rejects(() => old.decodeBackup(saved, N), /newer Cube Dash/);
});
