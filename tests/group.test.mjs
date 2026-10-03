import test from 'node:test';
import assert from 'node:assert/strict';
import { object, polygon, validateLevel } from '../src/engine.ts';
import { groupBox, inBox, transformGroup, duplicateGroup } from '../src/group.ts';

// Multi-select (#87): a group moves, turns, flips and copies as one shape.
const level = (objects) => ({ name: 'Group', length: 40, height: 10, objects });
// an L of blocks with a spike on top, a scaled turned ramp and a flipped half spike: every way a
// piece can sit off its own grid box
const shape = () => [
  object('block', 10, 0), object('block', 11, 0), object('block', 10, 1),
  { ...object('spike', 10, 2) },
  { ...object('ramp', 13, 1), scale: 2, rotation: 90 },
  { ...object('half', 11, 1), flipY: true, rotation: 270 },
  { ...object('scoop-grid', 14, 0), scale: 1.5, flipX: true },
];
const world = {
  cw: ([x, y]) => [y, -x], ccw: ([x, y]) => [-y, x], flipX: ([x, y]) => [-x, y], flipY: ([x, y]) => [x, -y],
};
const key = (points) => points.map(([x, y]) => `${x.toFixed(3)},${y.toFixed(3)}`).sort().join(' ');

test('a turn or a flip turns the whole shape, not each piece in its own place', () => {
  for (const action of ['cw', 'ccw', 'flipX', 'flipY']) {
    const before = shape(), after = transformGroup(before, action);
    // every piece's outline is the world turn of its old one, all by one shared shift
    const moved = before.map((o) => polygon(o).map(world[action]));
    const shifted = moved.flat(), out = after.map(polygon).flat();
    const dx = Math.min(...out.map((p) => p[0])) - Math.min(...shifted.map((p) => p[0])),
      dy = Math.min(...out.map((p) => p[1])) - Math.min(...shifted.map((p) => p[1]));
    after.forEach((o, i) =>
      assert.equal(key(polygon(o)), key(moved[i].map(([x, y]) => [x + dx, y + dy])), `${action} piece ${i} (${o.type})`));
    // and it stays where it was: the same bottom left corner, still a valid trail
    const a = groupBox(before), b = groupBox(after);
    assert.ok(Math.abs(a.left - b.left) < 0.051 && Math.abs(a.bottom - b.bottom) < 0.051, `${action} kept its corner`);
    validateLevel(level(after));
  }
  // four quarter turns come home
  let back = shape();
  for (let i = 0; i < 4; i++) back = transformGroup(back, 'cw');
  assert.deepEqual(back.map((o) => key(polygon(o))), shape().map((o) => key(polygon(o))));
});

test('moves step every piece; the originals are left alone', () => {
  const before = shape(), after = transformGroup(before, 'right', 0.5);
  assert.deepEqual(after.map((o) => o.x), before.map((o) => o.x + 0.5));
  assert.deepEqual(before, shape(), 'not mutated');
});

test('a swipe box catches every piece it touches on its layer', () => {
  const pieces = [...shape(), { ...object('block', 11, 2), layer: 'background' }, object('ring', 20, 3)];
  const l = level(pieces);
  assert.deepEqual(inBox(l, { left: 9.5, right: 11.2, bottom: 0.2, top: 0.8 }), [0, 1]);
  assert.deepEqual(inBox(l, { left: 9.5, right: 11.5, bottom: 0, top: 3 }), [0, 1, 2, 3, 5]);
  assert.deepEqual(inBox(l, { left: 9.5, right: 11.5, bottom: 0, top: 3 }, 'background'), [7]);
  assert.deepEqual(inBox(l, { left: 30, right: 31, bottom: 0, top: 3 }), []);
});

test('a copied group lands to its right, clear of what is there', () => {
  const l = level([object('block', 10, 0), object('block', 11, 0), object('block', 12, 0)]);
  // the copy of the first two skips past the third block
  assert.deepEqual(duplicateGroup(l, [0, 1]).map((o) => o.x), [14, 15]);
  assert.throws(() => duplicateGroup(level([object('block', 37, 0), object('block', 38, 0)]), [0, 1]), /No room/);
  assert.throws(() => duplicateGroup(l, []), /Select/);
});
