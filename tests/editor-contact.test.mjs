import test from 'node:test';
import assert from 'node:assert/strict';
import { createState, step, SIZE, DEATH_INSET, BLOCKS, RAMPS, SPIKES, object, polygon, intersects, duplicateObject } from '../src/engine.ts';
const empty = { name: 'Contact', length: 40, objects: [] };

test('jumper keeps safe top and underside contact under either gravity', () => {
  for (const type of BLOCKS) for (const gravity of [-1, 1]) {
    const block = object(type, 5, 2), level = { ...empty, objects: [block] };
    for (const [y, vy] of [[3.01, -2], [2 - SIZE - .01, 2]]) {
      const s = { ...createState(level), mode: 'jumper', gravity, x: 5, y, vy, grounded: false };
      step(s, false); assert.equal(s.status, 'playing');
      const body = [[s.x,s.y],[s.x+SIZE,s.y],[s.x+SIZE,s.y+SIZE],[s.x,s.y+SIZE]];
      assert.equal(intersects(body, polygon(block)), false);
    }
  }
});

test('every mode dies on all block walls and vertical ramp faces, with either gravity', () => {
  for (const mode of ['square', 'plane', 'wheel', 'jumper']) for (const gravity of [-1, 1]) {
    for (const type of [...BLOCKS, ...RAMPS]) for (const rotation of [0, 90, 180, 270]) for (const flipX of [false, true]) {
      const wall = { ...object(type, 5, 2), rotation, flipX };
      const points = polygon(wall);
      // Only approach a full vertical left face; the sloped approach is covered by ramp-walk tests.
      if (points.filter(([x]) => x === 5).length !== 2) continue;
      const s = { ...createState({ ...empty, objects: [wall] }), mode, gravity, x: 5 - SIZE, y: 2.1, grounded: false };
      step(s, false); assert.equal(s.status, 'playing', 'the smaller hazard box still forgives the outer edge');
      for (let i = 0; i < 5; i++) step(s, false);
      assert.equal(s.status, 'dead', `${mode} ${type} rotation=${rotation} flip=${flipX} gravity=${gravity}`);
      const dead = structuredClone(s); step(s, true); assert.deepEqual(s, dead, 'no climbing or movement after death');
    }
  }
});

test('smaller death box forgives spike-tip grazes but still kills direct hits in every mode', () => {
  assert.equal(SIZE - 2 * DEATH_INSET, .40);
  for (const mode of ['square', 'plane', 'wheel', 'jumper']) for (const type of SPIKES) {
    const spike = object(type, 5, 2), points = polygon(spike), top = Math.max(...points.map(p => p[1]));
    const center = (Math.min(...points.map(p => p[0])) + Math.max(...points.map(p => p[0]))) / 2;
    const base = { ...createState({ ...empty, objects: [spike] }), mode, x: center - SIZE / 2, y: top - .04, grounded: false };
    const graze = structuredClone(base); step(graze, false); assert.equal(graze.status, 'playing', `${mode} ${type} graze`);
    const hit = { ...base, y: top - .18 }; step(hit, false); assert.equal(hit.status, 'dead', `${mode} ${type} direct`);
  }
  for (const mode of ['square', 'plane', 'wheel', 'jumper']) {
    const s = { ...createState({ ...empty, objects: [object('block', 5)] }), mode, x: 5 - SIZE };
    step(s, false); assert.equal(s.status, 'playing', 'outer edge can graze block side');
    step(s, false); step(s, false); assert.equal(s.status, 'dead', 'inner box still dies on block side');
  }
});

test('copy + paste preserves transforms, skips occupied space, and refuses invalid copies without mutation', () => {
  const source = { ...object('half', 5, 2), rotation: 90, flipX: true, flipY: true };
  const level = { ...empty, objects: [source, { ...source, x: 6 }] }, snapshot = structuredClone(level);
  const copy = duplicateObject(level, 0);
  assert.deepEqual(copy, { ...source, x: 7 }); assert.deepEqual(level, snapshot);
  copy.flipX = false; assert.equal(source.flipX, true);
  const portal = { ...object('jumper', 5), rotation: 90 };
  assert.equal(duplicateObject({ ...empty, objects: [portal] }, 0).x, 7.5);
  assert.throws(() => duplicateObject(level, -1), /Select/);
  assert.throws(() => duplicateObject({ ...empty, objects: [object('block', 38)] }, 0), /No room/);
  assert.throws(() => duplicateObject({ ...empty, objects: Array(600).fill(source) }, 0), /600/);
});
