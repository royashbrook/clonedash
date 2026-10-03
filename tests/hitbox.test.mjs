import test from 'node:test';
import assert from 'node:assert/strict';
import { createState, step, object, SIZE, DEATH_INSET, SPIKE_INSET } from '../src/engine.ts';

// #73: spikes reach further into the cube than they used to, but not to its very edge; walls
// keep the old box, since a box past the solid body would kill a run standing on a block.
const at = (type, reach) => {
  const s = { ...createState({ name: 'Hitbox', length: 40, objects: [object(type, 6, 0)] }), x: 6 - SIZE + reach };
  step(s, false, 0); // no time passes: just ask whether this exact spot kills
  return s.status;
};

test('a spike box is bigger than the old one but still short of the body', () => {
  assert.ok(SPIKE_INSET < DEATH_INSET, 'bigger than walls get');
  assert.ok(SPIKE_INSET > 0, 'not the whole body');
  assert.equal(SIZE - 2 * SPIKE_INSET, 0.52);
});

test('a spike 0.10 into the body kills now; 0.05 is a graze that lives; a wall at 0.10 does not kill', () => {
  assert.equal(at('spike', 0.10), 'dead', 'the old 0.40 box missed this');
  assert.equal(at('spike', 0.05), 'playing', 'a graze on the edge still lives');
  assert.equal(at('block', 0.10), 'playing', 'walls keep the old box');
});
