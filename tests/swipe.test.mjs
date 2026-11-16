import test from 'node:test';
import assert from 'node:assert/strict';
import { object, validateLevel, MAX_COINS } from '../src/engine.ts';
import { cellsAlong, paintCell, eraseAlong, StrokeHistory, MAX_OBJECTS } from '../src/swipe.ts';

// #106, docs/ramps-and-boosters.md rule 6: the pure parts of SWIPE.
const level = (objects = [], extra = {}) => ({ name: 'Swipe', length: 60, objects, ...extra });
// the cell a tap at a point places into (App.svelte editAt)
const tapCell = ([x, y], step) => [Math.round(Math.round(x / step) * step * 20) / 20, Math.round(Math.floor(y / step) * step * 20) / 20];
const key = ([x, y]) => `${x},${y}`;

test('a drag covers every cell its path crosses, with no gap, however few samples a fast drag reports', () => {
  assert.deepEqual(cellsAlong([3.2, 1.5], [9.9, 1.5], 1).map(key), ['3,1', '4,1', '5,1', '6,1', '7,1', '8,1', '9,1', '10,1']);
  assert.deepEqual(cellsAlong([5.2, 0.5], [5.2, 4.9], 1).map(key), ['5,0', '5,1', '5,2', '5,3', '5,4']);
  assert.deepEqual(cellsAlong([5.2, 0.5], [5.3, 0.6], 1).map(key), ['5,0']);
  for (const step of [1, 0.5, 0.05])
    for (const [a, b] of [[[3.1, 0.2], [17.8, 5.7]], [[20.4, 6.1], [4.2, 0.3]], [[8, 3], [8.6, 0.1]], [[4.5, 2], [12.5, 2]]]) {
      const walk = cellsAlong(a, b, step),
        cells = new Set(walk.map(key));
      // in order, one cell at a time, across or up
      for (let k = 1; k < walk.length; k++)
        assert.ok(Math.abs(walk[k][0] - walk[k - 1][0]) + Math.abs(walk[k][1] - walk[k - 1][1]) <= step + 1e-9, `${step} ${k}`);
      // every cell a dense sampling of the same straight path taps into is in it
      for (let t = 0; t <= 1; t += 1 / 4000)
        assert.ok(cells.has(key(tapCell([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t], step))), `${step} t ${t}`);
      // and a slow drag along the same line, sample by sample, covers exactly the same cells
      const slow = new Set();
      for (let n = 0; n < 40; n++) {
        const p = (t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
        for (const c of cellsAlong(p(n / 40), p((n + 1) / 40), step)) slow.add(key(c));
      }
      assert.deepEqual([...slow].sort(), [...cells].sort(), `step ${step}`);
    }
});

test('painting a cell keeps a tap\'s rules: margins, one of a kind per cell and layer, the caps, the ceiling, the layer', () => {
  const lv = level();
  assert.equal(paintCell(lv, object('block', 2, 0)), 'outside');
  assert.equal(paintCell(lv, object('block', 59, 0)), 'outside');
  assert.equal(paintCell(lv, object('block', 5, 0)), 'placed');
  assert.equal(paintCell(lv, object('block', 5, 0)), 'taken', 'going back over a cell does not double it');
  assert.equal(paintCell(lv, object('spike', 5, 0)), 'taken', 'nor stack another piece there');
  assert.equal(lv.objects.length, 1, 'nor remove it');
  assert.equal(paintCell(lv, object('w-block', 5, 0)), 'placed', 'a zone lies over a block, as a tap allows');
  assert.equal(paintCell(level([], { height: 8 }), object('plane', 6, 7)), 'invalid', 'past the ceiling');
  assert.equal(paintCell(lv, { ...object('block', 5, 0), layer: 'background' }), 'placed', 'the background is its own layer');
  assert.equal(paintCell(lv, { ...object('spike', 7, 0), layer: 'background' }), 'invalid', 'only blocks go in the background');
  // the coin cap: the stroke stops placing coins at it
  const coins = level();
  for (let i = 0; i < MAX_COINS; i++) assert.equal(paintCell(coins, object('coin', 5 + i, 0)), 'placed');
  assert.equal(paintCell(coins, object('coin', 30, 0)), 'coins');
  assert.doesNotThrow(() => validateLevel(coins));
  // the object cap
  const full = level(Array.from({ length: MAX_OBJECTS }, (_, i) => object('block', 3 + (i % 50), Math.floor(i / 50) % 6)), { length: 600 });
  assert.equal(paintCell(full, object('block', 100, 0)), 'full');
  assert.equal(full.objects.length, MAX_OBJECTS);
});

test('erasing removes what the drag passes over, on its layer only, and going back over a cell removes nothing more', () => {
  const lv = level([object('block', 5, 0), object('spike', 6, 0), object('block', 7, 0), object('block', 6, 3), { ...object('block', 6, 0), layer: 'background' }]);
  assert.equal(eraseAlong(lv, [5.5, 0.5], [6.5, 0.5]), 2);
  assert.deepEqual(lv.objects.map((o) => [o.type, o.x, o.y, o.layer]), [['block', 7, 0, undefined], ['block', 6, 3, undefined], ['block', 6, 0, 'background']]);
  assert.equal(eraseAlong(lv, [6.5, 0.5], [5.5, 0.5]), 0);
  assert.equal(eraseAlong(lv, [6.5, 0.5], [6.5, 0.5], 'background'), 1, 'a tap erases what is under it');
});

const pieces = (...xs) => xs.map((x) => object('block', x, 0));
test('one stroke that changed something is one undo step; an empty stroke is none; undo and redo restore pieces and selection', () => {
  const h = new StrokeHistory();
  assert.equal(h.push({ before: pieces(5), after: pieces(5), groupBefore: [], groupAfter: [] }), false);
  assert.equal(h.done.length, 0, 'no empty step');
  h.push({ before: pieces(5), after: pieces(5, 6, 7), groupBefore: [0], groupAfter: [2] });
  h.push({ before: pieces(5, 6, 7), after: pieces(5, 6, 7, 8), groupBefore: [2], groupAfter: [3] });
  const back = h.undo(pieces(5, 6, 7, 8));
  assert.deepEqual([back.before, back.groupBefore], [pieces(5, 6, 7), [2]]);
  assert.deepEqual(h.undo(pieces(5, 6, 7)).before, pieces(5));
  assert.equal(h.undo(pieces(5)), null, 'nothing more to undo');
  assert.equal(h.undone.length, 2, 'and that does not drop the redo');
  const again = h.redo(pieces(5));
  assert.deepEqual([again.after, again.groupAfter], [pieces(5, 6, 7), [2]]);
  // a new stroke after an undo drops what could have been redone
  h.push({ before: pieces(5, 6, 7), after: pieces(5, 6, 7, 9), groupBefore: [], groupAfter: [] });
  assert.equal(h.undone.length, 0, 'the redo is dropped by the new stroke itself');
  assert.equal(h.redo(pieces(5, 6, 7, 9)), null);
  assert.equal(h.done.length, 2, 'and the new stroke is the step to undo');
});

test('an edit the history did not make invalidates it; it never undoes over that edit; it keeps at most 30 strokes', () => {
  const h = new StrokeHistory();
  h.push({ before: pieces(5), after: pieces(5, 6), groupBefore: [], groupAfter: [] });
  // someone moved a piece after the stroke: undo refuses and forgets everything
  assert.equal(h.undo(pieces(5, 7)), null);
  assert.equal(h.done.length + h.undone.length, 0);
  // and the same for redo
  h.push({ before: pieces(5), after: pieces(5, 6), groupBefore: [], groupAfter: [] });
  h.undo(pieces(5, 6));
  assert.equal(h.redo(pieces(4)), null);
  assert.equal(h.done.length + h.undone.length, 0);
  const many = new StrokeHistory();
  for (let i = 0; i < 40; i++) many.push({ before: pieces(i), after: pieces(i, 100), groupBefore: [], groupAfter: [] });
  assert.equal(many.done.length, 30);
  assert.deepEqual(many.done[0].before, pieces(10), 'the oldest go first');
});
