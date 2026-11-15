import test from 'node:test';
import assert from 'node:assert/strict';
import { createState, step, object, validateLevel, duplicateObject, MAX_COINS } from '../src/engine.ts';
import { duplicateGroup } from '../src/group.ts';
import { encodeLevel, decodeLevel, importLevel } from '../src/transfer.ts';
import { readSave, keepCoins, shownCoins, SAVE } from '../src/library.ts';
import { Run } from '../src/run.ts';

// Coins (#101): a placeable piece, at most 10 a level, picked up by touch, best kept per level.
const level = (objects, length = 40) => ({ name: 'Coins', length, objects });
const coins = (n, y = 3) => Array.from({ length: n }, (_, i) => object('coin', 4 + i * 2, y));
const raw = (value) => 'cdl1.0' + Buffer.from(JSON.stringify(value)).toString('base64url');
const play = (l, steps = 2000) => {
  const s = createState(l);
  for (let i = 0; i < steps && s.status === 'playing'; i++) step(s, false);
  return s;
};

test('coin cap: ten is fine, an eleventh is refused by every reader', async () => {
  assert.doesNotThrow(() => validateLevel(level(coins(MAX_COINS))));
  assert.throws(() => validateLevel(level(coins(MAX_COINS + 1))), /up to 10 coins/);
  const eleven = level(coins(11));
  // a share code, pasted or opened as a link
  await assert.rejects(() => decodeLevel(raw(eleven)), /10 coins/);
  await assert.rejects(() => encodeLevel(eleven), /10 coins/);
  // a saved draft and a saved library entry
  const save = (draft, customLevels) => JSON.stringify({ version: 1, best: {}, sound: false, draft, ...(customLevels && { customLevels, activeLevel: 1 }) });
  assert.throws(() => readSave(save(eleven), 23), /10 coins/);
  assert.throws(() => readSave(save(level([]), [{ id: 1, level: level([]) }, { id: 2, level: eleven }]), 23), /10 coins/);
  // copy + paste of one piece and of a group
  const ten = level(coins(10));
  assert.throws(() => duplicateObject(ten, 0), /10 coins/);
  assert.throws(() => duplicateGroup(ten, [0, 1]), /10 coins/);
  const nine = level(coins(9));
  assert.equal(duplicateObject(nine, 0).type, 'coin');
  assert.throws(() => duplicateGroup(nine, [0, 1]), /10 coins/, 'two more would make eleven');
  // an import is refused whole, and nothing in storage changes
  const store = new Map([[SAVE, JSON.stringify(readSave(null, 23))]]);
  const storage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) };
  const before = store.get(SAVE);
  assert.throws(() => importLevel(storage, readSave(before, 23), eleven, 23), /10 coins/);
  assert.equal(store.get(SAVE), before);
});

test('coin pickup: touching one counts it once, it never blocks or kills, and a far one is left', () => {
  // a coin is always there to pick up: it can be hidden (a secret coin) but never NO TOUCH
  assert.throws(() => validateLevel(level([{ ...object('coin', 12, 0), noTouch: true }])), /no touch/i);
  const l = validateLevel(level([object('coin', 6, 0), object('coin', 9, 4), { ...object('coin', 12, 0), hidden: true }]));
  const s = createState(l);
  assert.equal(s.fx.coinTotal, 3);
  for (let i = 0; i < 2000 && s.status === 'playing'; i++) {
    step(s, false);
    if (s.x > 7.5 && s.x < 11) assert.equal(s.fx.coins, 1, 'the floor coin is picked up as the run passes it');
  }
  assert.equal(s.status, 'complete', 'a coin is not solid');
  assert.equal(s.fx.coins, 2, 'the high coin was never touched, the hidden one was picked up');
  assert.deepEqual([...s.fx.got.slice(0, 3)], [1, 0, 1]);
  // a restart puts every coin back
  const run = new Run(l);
  run.readyTime = 0;
  for (let i = 0; i < 400; i++) run.advance(1 / 120);
  assert.equal(run.state.fx.coins, 2);
  run.reset();
  assert.equal(run.state.fx.coins, 0);
  assert.deepEqual([...run.state.fx.got.slice(0, 3)], [0, 0, 0]);
});

test('best coins: the most in one completed run, never a sum over tries, clamped to the level', () => {
  const l = level([object('coin', 6, 0), object('coin', 8, 0), object('coin', 10, 3)]);
  const save = readSave(null, 23);
  const done = (got) => ({ ...createState(l), status: 'complete', fx: { ...createState(l).fx, coins: got } });
  const died = (got) => ({ ...done(got), status: 'dead' });
  assert.equal(keepCoins(save, died(3), l, true, 0), false, 'a run that died keeps nothing');
  assert.equal(save.customLevels[0].coins, undefined);
  assert.equal(keepCoins(save, done(1), l, true, 0), true);
  assert.equal(keepCoins(save, done(1), l, true, 0), false, 'not a sum: one plus one is still one');
  assert.equal(save.customLevels[0].coins, 1);
  assert.equal(keepCoins(save, done(2), l, true, 0), true);
  assert.equal(keepCoins(save, done(1), l, true, 0), false, 'a worse run never lowers the best');
  assert.equal(save.customLevels[0].coins, 2);
  // a real completed run through the engine
  const real = play(l);
  assert.equal(real.status, 'complete');
  assert.equal(real.fx.coins, 2);
  // the level is edited down to one coin: an old best of 2 shows as 1 / 1, never 2 / 1
  const edited = level([object('coin', 6, 0)]);
  assert.equal(shownCoins(save.customLevels[0].coins, edited), 1);
  assert.equal(shownCoins(undefined, edited), 0);
  // built-in trails keep theirs alongside best, by trail index
  assert.equal(keepCoins(save, done(3), l, false, 4), true);
  assert.deepEqual(save.coins, { 4: 3 });
  const back = readSave(JSON.stringify(save), 23);
  assert.deepEqual(back.coins, { 4: 3 });
  assert.equal(back.customLevels[0].coins, 2);
  // a level without coins never writes a coin best
  const plain = readSave(null, 23);
  assert.equal(keepCoins(plain, play(level([]), 400), level([]), true, 0), false);
  assert.equal(JSON.stringify(plain), JSON.stringify(readSave(null, 23)));
});

test('a save with a broken coin best is refused like broken progress', () => {
  const base = readSave(null, 23);
  for (const coinsField of [{ 0: 11 }, { 0: -1 }, { 0: 1.5 }, { 23: 1 }, { x: 1 }, [], null])
    assert.throws(() => readSave(JSON.stringify({ ...base, coins: coinsField }), 23), /progress/, JSON.stringify(coinsField));
  for (const entryCoins of [11, -1, 'two', 0.5])
    assert.throws(() => readSave(JSON.stringify({ ...base, customLevels: [{ ...base.customLevels[0], coins: entryCoins }] }), 23), /progress/);
});

test('old saves and old levels have no coin fields and read back byte for byte', () => {
  const old = JSON.stringify({ version: 1, best: { 0: 100, 3: 40 }, sound: true, draft: { name: 'Old', length: 40, objects: [object('grid', 6)] }, customLevels: [{ id: 1, level: { name: 'Old', length: 40, objects: [object('grid', 6)] } }], activeLevel: 1 });
  const read = readSave(old, 23);
  assert.equal(JSON.stringify(read), old);
  assert.equal('fx' in createState(read.draft), false, 'a run of a level without coins or triggers has the state it always had');
});
