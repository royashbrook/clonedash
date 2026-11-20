import { test } from 'node:test';
import assert from 'node:assert/strict';
import { object, validateLevel, step, STEP, SIZE, SPEED, SPEEDS, BUILD_MARGIN } from '../src/engine.ts';
import { GAME_MODES } from '../src/types.ts';
import { Run } from '../src/run.ts';
import { decodeLevel, encodeLevel, portableLevel } from '../src/transfer.ts';
import { blankLoop } from '../src/loop.ts';
import { encodeBackup, decodeBackup } from '../src/backup.ts';
import { readSave, storeDraft } from '../src/library.ts';
import { emptyStore } from '../src/skin.ts';

const base = { name: 'First beat', length: 30, objects: [] };
test('every starting mode and speed applies from the first step and on retry', () => {
  for (const startMode of GAME_MODES) for (const startSpeed of Object.values(SPEEDS)) {
    const run = new Run(validateLevel({ ...base, startMode, startSpeed }));
    assert.deepEqual([run.state.mode, run.state.speed], [startMode, startSpeed]);
    step(run.state, false, STEP);
    assert.ok(Math.abs(run.state.x - 1 - SPEED * STEP * startSpeed) < 1e-8);
    run.state.mode = 'square'; run.state.speed = 1;
    run.reset();
    assert.deepEqual([run.state.mode, run.state.speed], [startMode, startSpeed]);
  }
  for (const bad of [{ startMode: 'ship' }, { startSpeed: 0 }, { startMode: null }, { startSpeed: '1' }, { offMap: 1 }])
    assert.throws(() => validateLevel({ ...base, ...bad }));
  const s = new Run(base).state;
  assert.deepEqual([s.mode, s.speed], ['square', 1]);
});

test('an off-map build has the same finish, ceiling and floor as the original', () => {
  const objects = [[-3, 0], [0,-3], [5,10], [40,0]].map(([x,y]) => object('block',x,y));
  assert.throws(() => validateLevel({ ...base, objects }));
  assert.throws(() => validateLevel({ ...base, offMap: true, objects: [object('block', -BUILD_MARGIN-1)] }));
  const level = validateLevel({ ...base, startMode: 'angle', offMap: true, objects });
  const state = new Run(level).state;
  for (let i=0; i<1200 && state.status === 'playing'; i++) {
    step(state, i<300, STEP);
    assert.ok(state.y >= 0 && state.y <= 7 - SIZE + 1e-7);
  }
  assert.equal(state.status, 'complete');
  assert.ok(state.x >= 30 && state.x < 30.1);
  assert.deepEqual(state.level.objects, objects);
});

test('share codes and a whole save keep outside pieces, settings and a custom song together', async () => {
  const level = { ...base, startMode: 'door', startSpeed: 1.5, offMap: true, objects: [object('spike', -2, 9)], loop: blankLoop() };
  for (const value of [level, { ...base, startSpeed: 0.8 }, { ...base, startMode: 'wheel' }, { ...base, offMap: true }]) {
    const code = await encodeLevel(value);
    assert.match(code, /^cdl4\./);
    assert.deepEqual(await decodeLevel(code), portableLevel(value));
    for (const v of ['1','2','3']) await assert.rejects(() => decodeLevel(code.replace('cdl4', 'cdl'+v)));
  }
  const plain = await encodeLevel(base);
  assert.match(plain, /^cdl1\./); await assert.rejects(() => decodeLevel(plain.replace('cdl1', 'cdl4')));
  const game = readSave(null, 23); storeDraft(game, level);
  const saved = { game, skins: emptyStore() };
  assert.deepEqual(await decodeBackup(await encodeBackup(saved,23),23), saved);
});
