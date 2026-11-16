import test from 'node:test';
import assert from 'node:assert/strict';
import { object, bounds, polygon, pointOf, createState, step, ringReady, validateLevel, duplicateObject, transform, SIZE, PADS } from '../src/engine.ts';
import { transformGroup, duplicateGroup, inBox } from '../src/group.ts';
import { encodeLevel, decodeLevel, appendLevel } from '../src/transfer.ts';
import { readSave } from '../src/library.ts';
import { render } from '../src/render.ts';

// #106, docs/ramps-and-boosters.md rule 5: every piece with a body takes a size.
const level = (objects, extra = {}) => ({ name: 'Size', length: 60, objects, ...extra });
const sized = (type, x, y, scale, extra = {}) => ({ ...object(type, x, y), scale, ...extra });
const round = (b) => Object.fromEntries(Object.entries(b).map(([k, v]) => [k, +v.toFixed(9)]));

test('a sized ring, portal, coin and booster grow from their base at 0.25, 1 and 4; size 1 is the unsized shape', () => {
  for (const type of ['ring', 'plane', 'gravity-up', 'coin', ...PADS])
    assert.deepEqual(polygon(sized(type, 5, 2, 1)), polygon(object(type, 5, 2)), type);
  // a ring: centre over its cell, rising with its size; radius 0.45 times the size
  assert.deepEqual(round(bounds(sized('ring', 5, 2, 4))), { left: 3.7, right: 7.3, bottom: 2.2, top: 5.8 });
  assert.deepEqual(round(bounds(sized('ring', 5, 2, 0.25))), { left: 5.3875, right: 5.6125, bottom: 2.0125, top: 2.2375 });
  // a portal 0.6 by 2.5, from its base
  assert.deepEqual(round(bounds(sized('plane', 5, 0, 2))), { left: 4.7, right: 5.9, bottom: 0, top: 5 });
  assert.deepEqual(round(bounds(sized('plane', 5, 0, 0.25))), { left: 5.225, right: 5.375, bottom: 0, top: 0.625 });
  // a coin: radius 0.3 times the size
  assert.deepEqual(round(bounds(sized('coin', 5, 0, 4))), { left: 4.3, right: 6.7, bottom: 0.8, top: 3.2 });
  // a booster: its strip, from the floor
  assert.deepEqual(round(bounds(sized('yellow-pad', 5, 0, 4))), { left: 3.9, right: 7.1, bottom: 0, top: 1 });
  assert.deepEqual(round(bounds(sized('yellow-pad', 5, 0, 0.25))), { left: 5.4, right: 5.6, bottom: 0, top: 0.0625 });
  // turned over, a sized ring and booster grow down from the top of their cell
  assert.deepEqual(round(bounds(sized('ring', 5, 4, 2, { rotation: 180 }))), { left: 4.6, right: 6.4, bottom: 3.1, top: 4.9 });
  assert.deepEqual(round(bounds(sized('red-pad', 5, 4, 2, { rotation: 180 }))), { left: 4.7, right: 6.3, bottom: 4.5, top: 5 });
  assert.deepEqual(pointOf(sized('ring', 5, 4, 2, { rotation: 180 }), 0.5, 0.5), [5.5, 4]);
});

test('a sized ring is reached at its drawn centre and within its grown reach', () => {
  const at = (r, x, y) => ringReady({ ...createState(level([r])), x, y }, r, 0);
  // big: the centre rises to y 2, the reach to 2.4
  const big = sized('ring', 5, 0, 4);
  assert.equal(at(big, 5.2, 3.9), true, 'reached high above the cell');
  assert.equal(at(big, 5.2, 4.5), false, 'not past its reach');
  assert.equal(at(object('ring', 5, 0), 5.2, 3.9), false, 'the control: an unsized ring there is not reached');
  // small: the centre sinks to y 0.125, the reach to 0.15
  const small = sized('ring', 5, 0, 0.25);
  assert.equal(at(small, 5.2, 0.2), true);
  assert.equal(at(small, 5.2, 0.5), false, 'out of a small ring\'s reach');
  assert.equal(at(object('ring', 5, 0), 5.2, 0.5), true, 'the control: an unsized one reaches it');
  // and a tap there fires it
  const s = { ...createState(level([big])), x: 5.2, y: 3.9, grounded: false };
  step(s, true, undefined, true);
  assert.deepEqual(s.usedRings, [0]);
});

test('a sized portal, coin and booster are touched by their real shape, as far from the anchor as it reaches', () => {
  // a gravity portal four times the size, turned on its side: 10 blocks wide, reaching 8.45 left of its anchor
  const wide = sized('gravity-up', 20, 0, 4, { rotation: 90 });
  assert.deepEqual(round(bounds(wide)), { left: 11.55, right: 21.55, bottom: 0.05, top: 2.45 });
  const s = { ...createState(level([wide])), x: 11.75, y: 0, grounded: true };
  step(s, false);
  assert.equal(s.gravity, 1, 'flipped by the far end of the portal');
  // a coin of size 3 picked up where its drawing is, not its cell
  const coin = { ...createState(level([sized('coin', 8, 0, 3)])), x: 7.9, y: 1.6, grounded: false };
  step(coin, false);
  assert.equal(coin.fx.coins, 1);
  // a booster of size 2 fires under a body its unsized strip would miss
  for (const [scale, fires] of [[2, true], [undefined, false]]) {
    const pad = { ...createState(level([{ ...object('yellow-pad', 8, 0), ...(scale && { scale }) }])), x: 7.75 - SIZE, y: 0, grounded: true };
    step(pad, false);
    assert.equal(pad.fx.pads.length > 0, fires, `size ${scale}`);
  }
});

test('the ceiling covers sized rings, portals, coins and boosters at the default height of 7 too; old pieces load as before', () => {
  for (const [piece, fits] of [
    [sized('plane', 10, 2, 2), true],
    [sized('plane', 10, 3, 2), false],
    [sized('ring', 10, 5, 2), true],
    [sized('ring', 10, 6, 2), false],
    [sized('coin', 10, 5, 1.5), true],
    [sized('coin', 10, 6, 4), false],
    [sized('gray-pad', 10, 6, 4, { rotation: 180 }), true],
  ]) {
    const check = () => validateLevel(level([piece]));
    if (fits) assert.doesNotThrow(check, JSON.stringify(piece));
    else assert.throws(check, /above ceiling/, JSON.stringify(piece));
  }
  // what main accepted at the default height still loads: an unsized portal reaching past row 7,
  // and a sized block that does (only a level that sets its height checks those)
  assert.doesNotThrow(() => validateLevel(level([object('plane', 10, 6)])));
  assert.doesNotThrow(() => validateLevel(level([sized('block', 10, 6, 4)])));
  assert.throws(() => validateLevel(level([sized('block', 10, 6, 4)], { height: 8 })), /above ceiling/);
  // and a trigger never takes a size
  assert.throws(() => validateLevel(level([sized('color-trigger', 10, 1, 2)])), /Invalid scale/);
  for (const bad of [0.2, 4.5, NaN, Infinity])
    assert.throws(() => validateLevel(level([sized('ring', 10, 1, bad)])), /Invalid scale/);
});

test('every reader keeps a size: share codes, saves, the library, copy and paste, group copies and turns', async () => {
  const pieces = [sized('ring', 10, 1, 2), sized('speed-fast', 14, 0, 0.5), sized('coin', 18, 1, 3), sized('blue-pad', 22, 0, 1.5), object('ring', 26, 1)],
    authored = level(pieces);
  const decoded = await decodeLevel(await encodeLevel(authored));
  assert.deepEqual(decoded.objects, pieces);
  assert.equal('scale' in decoded.objects[4], false, 'size 1 is no field');
  const save = appendLevel(readSave(null, 23), authored);
  assert.deepEqual(readSave(JSON.stringify(save), 23).customLevels.at(-1).level.objects, pieces);
  // copy and paste steps a sized ring along by its own width
  const copy = duplicateObject(authored, 0);
  assert.equal(copy.scale, 2);
  assert.ok(copy.x >= 11.8, `${copy.x}`);
  const group = duplicateGroup(authored, [0, 2]);
  assert.deepEqual(group.map((o) => o.scale), [2, 3]);
  // a group flip keeps the group where it was, sizes and all
  const before = [sized('ring', 10, 1, 2), sized('coin', 12, 1, 3)],
    flipped = transformGroup(before, 'flipY');
  const box = (os) => round({ left: Math.min(...os.map((o) => bounds(o).left)), bottom: Math.min(...os.map((o) => bounds(o).bottom)) });
  assert.deepEqual(box(flipped), box(before));
  assert.deepEqual(flipped.map((o) => o.scale), [2, 3]);
  // a sized portal turns a quarter at a time and stays valid
  const turned = transform(sized('plane', 10, 1, 2), 'cw');
  assert.equal(turned.rotation, 270);
  assert.doesNotThrow(() => validateLevel(level([turned])));
});

test('the editor picks a sized piece by its drawn shape: a swipe box that touches only the grown ring catches it', () => {
  const lv = level([sized('ring', 10, 0, 4)]);
  assert.deepEqual(inBox(lv, { left: 9, right: 9.5, bottom: 3, top: 3.5 }), [0]);
  assert.deepEqual(inBox(level([object('ring', 10, 0)]), { left: 9, right: 9.5, bottom: 3, top: 3.5 }), []);
});

// what the canvas is told to paint (the recorder from tests/render-objects.test.mjs)
Object.assign(globalThis, { innerWidth: 932, innerHeight: 430, devicePixelRatio: 2 });
function paint(options) {
  const log = [];
  const ctx = new Proxy({}, {
    set(target, key, value) { target[key] = value; log.push(['set', key, value]); return true; },
    get(target, key) {
      if (key in target) return target[key];
      return (...args) => { log.push([key, ...args]); if (key === 'createLinearGradient') return { addColorStop() {} }; };
    },
  });
  const view = render({ width: 1864, height: 860, getContext: () => ctx }, options);
  return { log, view };
}
test('a sized ring, coin and portal are drawn at the centre and size they are touched at', () => {
  for (const [piece, kind, at, radius] of [
    [sized('ring', 6, 0, 2), 'arc', [6.5, 1], 0.9],
    [sized('coin', 6, 0, 3), 'arc', [6.5, 1.5], 0.9],
    [sized('plane', 6, 0, 2), 'ellipse', [6.3, 2.5], 0.6],
  ]) {
    const { log, view } = paint({ state: null, level: level([piece]), editing: true });
    const X = (x) => (x - 0) * view.unit, Y = (y) => view.floor - y * view.unit;
    const drawn = log.find(([cmd]) => cmd === kind);
    assert.ok(drawn, piece.type);
    assert.ok(Math.abs(drawn[1] - X(at[0])) < 1e-6 && Math.abs(drawn[2] - Y(at[1])) < 1e-6, `${piece.type} centre`);
    assert.ok(Math.abs(drawn[3] - radius * view.unit) < 1e-6, `${piece.type} size`);
  }
});
