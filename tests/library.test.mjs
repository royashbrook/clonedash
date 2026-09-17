import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readSave, storeDraft, selectLevel, newLevel } from '../src/library.ts';
import { object, createState, step, STEP, SIZE, validateLevel, duplicateObject } from '../src/engine.ts';
import { trackFor } from '../src/music.ts';

test('legacy draft migrates intact, independent levels survive a round trip, progress stays', () => {
  const draft = { name: 'My old level', length: 80, objects: [object('grid', 10, 2)] };
  let save = readSave(JSON.stringify({ version: 1, best: { 0: 100 }, draft, sound: true }), 9);
  assert.deepEqual(save.draft, draft); assert.deepEqual(save.customLevels[0].level, draft);
  const second = newLevel(save); second.name = 'Second'; second.height = 20; second.song = 5;
  second.objects.push({ ...object('black', 12, 15), layer: 'background' }); storeDraft(save, second);
  save = readSave(JSON.stringify(save), 9);
  assert.equal(save.activeLevel, 2); assert.deepEqual(save.draft, second);
  assert.deepEqual(selectLevel(save, 1), draft); assert.deepEqual(save.best, { 0: 100 });
  assert.deepEqual(selectLevel(save, 2), second); assert.equal(save.sound, true);
});

test('malformed libraries and invalid dimensions/layers/songs fail closed', () => {
  const good = readSave(null, 9);
  for (const change of [s => s.customLevels = null, s => s.customLevels = [], s => s.activeLevel = 9, s => s.customLevels.push(s.customLevels[0]), s => s.customLevels[0].level.height = 100]) {
    const s = structuredClone(good); change(s); assert.throws(() => readSave(JSON.stringify(s), 9));
  }
  for (const change of [l => l.height = 6, l => l.height = 40.1, l => l.height = NaN, l => l.song = -1, l => l.song = 109, l => l.objects.push({ ...object('spike', 5), layer: 'background' }), l => l.objects.push({ ...object('block', 5), layer: 'wat' })]) {
    const l = structuredClone(good.draft); change(l); assert.throws(() => validateLevel(l));
  }
  const tall = { ...good.draft, height: 20, objects: [object('block', 8, 19)] };
  assert.deepEqual(validateLevel(tall), tall); assert.throws(() => validateLevel({ ...tall, height: 19 }));
});

test('100 level originals have distinct musical recipes; capacity never overwrites a level', () => {
  const s = readSave(null, 9), songs = [trackFor(9)];
  for (let i = 1; i < 100; i++) songs.push(trackFor(newLevel(s).song));
  assert.equal(new Set(songs.map(t => JSON.stringify([t.root, t.melody, t.wobble]))).size, 100);
  assert.equal(new Set(songs.map(t => t.name)).size, 100);
  const before = structuredClone(s); assert.throws(() => newLevel(s)); assert.deepEqual(s, before);
  assert.deepEqual(readSave(JSON.stringify(s), 9), s);
  const sparse = readSave(null, 9); sparse.customLevels[0].id = sparse.activeLevel = 100;
  assert.equal(newLevel(sparse).song, 9); assert.doesNotThrow(() => readSave(JSON.stringify(sparse), 9));
});

test('background blocks are not lethal, supporting or blocking in any mode; copies ignore other layers', () => {
  for (const mode of ['square', 'wheel', 'jumper', 'plane']) {
    const level = { name: 'Layers', length: 20, objects: [{ ...object('block', 5), layer: 'background' }] };
    const s = createState(level); s.mode = mode;
    for (let n = 0; n < 140; n++) step(s, false);
    assert.equal(s.status, 'playing'); assert.ok(s.x > 6); assert.equal(s.y, 0);
    const falling = createState(level); falling.mode = mode; falling.x = 5; falling.y = 1.01; falling.vy = -2; falling.grounded = false;
    step(falling, false, .03); assert.ok(falling.y < 1, 'decoration cannot support a landing');
  }
  const solid = createState({ name: 'Control', length: 20, objects: [object('block', 5)] });
  for (let n = 0; n < 140; n++) step(solid, false);
  assert.equal(solid.status, 'dead');
  const l = { name: 'Layers', length: 20, objects: [{ ...object('block', 5), layer: 'background' }, object('block', 6)] };
  assert.equal(duplicateObject(l, 0).x, 6);
});

test('tall worlds use their real ceiling for flight, inverted gravity and portals', () => {
  for (const height of [7, 20, 40]) {
    const l = { name: 'Sky', length: 200, height, objects: [] };
    for (const mode of ['plane', 'jumper', 'wheel']) {
      const s = createState(l); s.mode = mode; s.gravity = 1; s.y = height - SIZE - .01; s.vy = 2;
      for (let i = 0; i < 60; i++) step(s, false, STEP);
      assert.equal(s.status, 'playing'); assert.equal(s.y, height - SIZE); assert.equal(s.grounded, true);
    }
    if (height > 7) {
      const s = createState({ ...l, objects: [object('plane', 5, 10)] }); s.x = 4.9; s.y = 10.5;
      step(s, false); assert.equal(s.mode, 'plane'); assert.ok(s.y > 10); assert.equal(s.status, 'playing');
    }
  }
});
