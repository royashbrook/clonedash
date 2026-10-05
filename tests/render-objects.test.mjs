import test from 'node:test';
import assert from 'node:assert/strict';
import { createState, object } from '../src/engine.ts';
import { render } from '../src/render.ts';

// What the canvas is told to paint, recorded command by command (the migration test's recorder).
Object.assign(globalThis, { innerWidth: 932, innerHeight: 430, devicePixelRatio: 2 });
function commands(options) {
  const log = [];
  const ctx = new Proxy({}, {
    set(target, key, value) { target[key] = value; log.push(['set', key, value]); return true; },
    get(target, key) {
      if (key in target) return target[key];
      return (...args) => { log.push([key, ...args]); if (key === 'createLinearGradient') return { addColorStop() {} }; };
    },
  });
  render({ width: 1864, height: 860, getContext: () => ctx }, options);
  return JSON.parse(JSON.stringify(log));
}
const level = (objects) => ({ name: 'Paint', length: 40, objects });
const block = { ...object('block', 6, 0), hidden: true };

test('HIDDEN paints nothing in play and paints faint in the editor (#96)', () => {
  const play = (objects) => commands({ state: createState(level(objects)), level: level(objects) });
  assert.deepEqual(play([block]), play([]), 'in play a hidden block is not painted at all');
  assert.notDeepEqual(play([{ ...block, hidden: undefined }]), play([]), 'the control: a plain block is');
  const edit = commands({ state: null, level: level([block]), editing: true });
  const alphas = edit.filter(([cmd, key]) => cmd === 'set' && key === 'globalAlpha').map(([, , v]) => v);
  assert.ok(alphas.includes(0.3), `faint in the editor, alphas ${alphas}`);
  assert.ok(edit.some(([cmd, text]) => cmd === 'fillText' && text === 'H'), 'and marked H');
});

test('the croissant is painted as its own shape, both ways up (#97)', () => {
  for (const gravity of [-1, 1]) {
    const state = { ...createState(level([])), mode: 'croissant', gravity, x: 9, y: 2 };
    const log = commands({ state, level: state.level, camera: 5 });
    const square = commands({ state: { ...state, mode: 'square' }, level: state.level, camera: 5 });
    assert.notDeepEqual(log, square);
    assert.ok(log.filter(([cmd]) => cmd === 'arc').length >= 2, 'a crescent: two arcs');
  }
});
