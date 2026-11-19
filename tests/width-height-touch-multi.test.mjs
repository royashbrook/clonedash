import test from 'node:test';
import assert from 'node:assert/strict';
import { object, bounds, polygon, pointOf, createState, step, inReach, ringReady, runTriggers, validateLevel, toCentred, resized, axes, transform, STEP, SIZE } from '../src/engine.ts';
import { transformGroup } from '../src/group.ts';
import { encodeLevel, decodeLevel } from '../src/transfer.ts';

// #117, docs/width-height-touch-multi.md.
const level = (objects, extra = {}) => ({ name: 'Round3', length: 40, objects, ...extra });
const piece = (type, x, y, extra = {}) => ({ ...object(type, x, y), ...extra });
const round = (v) => (Array.isArray(v) ? v.map(round) : typeof v === 'number' ? +v.toFixed(9) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, round(x)])) : v);

test('rule 1: width and height grow a piece from its middle along its own axes, and a turn or flip keeps it in place', () => {
  const wide = piece('grid', 5, 1, { scaleX: 2, scaleY: 1 });
  assert.deepEqual(round(bounds(wide)), { left: 4.5, right: 6.5, bottom: 1, top: 2 });
  assert.deepEqual(round(bounds(piece('grid', 5, 1, { scaleX: 1, scaleY: 2 }))), { left: 5, right: 6, bottom: 0.5, top: 2.5 });
  // a quarter turn stands it on its end about the same middle
  assert.deepEqual(round(bounds({ ...wide, rotation: 90 })), { left: 5, right: 6, bottom: 0.5, top: 2.5 });
  assert.deepEqual(round(pointOf({ ...wide, rotation: 37 }, 0.5, 0.5)), [5.5, 1.5]);
  // a flip of a spike points it the other way without moving its box
  const spike = piece('spike', 5, 1, { scaleX: 1, scaleY: 3 });
  assert.deepEqual(round(bounds({ ...spike, flipY: true })), round(bounds(spike)));
  // the control: the single scale grows from the base, so its box is not where its middle was
  assert.deepEqual(round(bounds(piece('grid', 5, 1, { scale: 2 }))), { left: 4.5, right: 6.5, bottom: 1, top: 3 });
  // a natural non-square piece: a portal 0.6 by 2.5 grows from its middle too
  assert.deepEqual(round(bounds(piece('plane', 5, 1, { scaleX: 2, scaleY: 2 }))), { left: 4.7, right: 5.9, bottom: -0.25, top: 4.75 });
  // a group flip moves nothing a width and height piece did not already cover
  const [flipped] = transformGroup([spike], 'flipY');
  assert.deepEqual(round(bounds(flipped)), round(bounds(spike)));
});

test('rule 2: a single-scale piece converts exactly, with its shape where it was; an unchanged piece is returned as it was', () => {
  const old = piece('small', 5, 1, { scale: 3, rotation: 30, flipX: true });
  const now = toCentred(old);
  assert.deepEqual(round(polygon(now)), round(polygon(old)), 'not moved');
  assert.equal(now.scale, undefined);
  assert.deepEqual([now.scaleX, now.scaleY], [3, 3]);
  // exact: no twentieth rounding of the new anchor
  const { w, h } = { w: 2 / 3, h: 2 / 3 },
    [cx, cy] = pointOf(old, w / 2, h / 2);
  assert.equal(now.x, cx - w / 2);
  assert.equal(now.y, cy - h / 2);
  assert.notEqual(Math.round(now.y * 20) / 20, now.y, 'the anchor is off the grid and kept there');
  // a turn or flip leaves it there; only a nudge snaps
  assert.equal(transform(structuredClone(now), 'cw').y, now.y);
  assert.equal(transform(structuredClone(now), 'flipY').y, now.y);
  assert.equal(transform(structuredClone(now), 'up', 0.05).y, Math.round((now.y + 0.05) * 20) / 20);
  // unsized and already-converted pieces come back as they were
  const plain = piece('grid', 5, 1);
  assert.equal(toCentred(plain), plain);
  assert.equal(toCentred(now), now);
  // resized: 1 by 1 is no field; a single-scale piece is converted first
  assert.deepEqual(resized(piece('grid', 5, 1, { scaleX: 2, scaleY: 1 }), 1, 1), plain);
  assert.deepEqual(round(resized(piece('grid', 5, 1, { scale: 2 }), 2, 3)), round(piece('grid', 5, 1.5, { scaleX: 2, scaleY: 3 })));
  assert.deepEqual(axes(piece('grid', 5, 1, { scale: 2 })), [2, 2]);
  // a stored scale of 1 (valid since #106) converts to no size field where it stood, and the
  // turn or flip that converted it is a valid level (a scaleX and scaleY of 1 would be refused)
  for (const type of ['block', 'small', 'plane', 'ring']) {
    const one = piece(type, 8, 1, { scale: 1, hidden: true, rotation: 90 });
    validateLevel(level([one]));
    assert.deepEqual(toCentred(one), piece(type, 8, 1, { hidden: true, rotation: 90 }), type);
    for (const action of ['cw', 'ccw', 'flipX', 'flipY'])
      validateLevel(level([transform(toCentred(structuredClone(one)), action)]));
  }
});

test('rule 2b: the anchor bound is the same numbers for both modes, so a conversion out of it is refused, not clamped', () => {
  const portal = piece('plane', 3, 1, { scale: 4, rotation: 90 });
  validateLevel(level([portal]));
  const converted = toCentred(portal);
  assert.equal(round(converted.x), -0.75);
  assert.deepEqual(round(polygon(converted)), round(polygon(portal)), 'its shape has not moved');
  assert.throws(() => validateLevel(level([converted])), /Invalid object/);
  // at the edges a converted piece still loads
  validateLevel(level([piece('grid', 3, -0.5, { scaleX: 2, scaleY: 2 })]));
  assert.throws(() => validateLevel(level([piece('grid', 2.95, 0, { scaleX: 2, scaleY: 2 })])), /Invalid object/);
});

test('rule 1b and 3a: the fields are checked by every reader', () => {
  const ok = (o) => validateLevel(level([o])),
    bad = (o, re) => assert.throws(() => validateLevel(level([o])), re);
  ok(piece('ring', 8, 2, { scaleX: 0.25, scaleY: 4, multi: true }));
  ok(piece('move-trigger', 8, 0, { touch: true, multi: true }));
  bad(piece('grid', 8, 1, { scaleX: 2 }), /Invalid size/);
  bad(piece('grid', 8, 1, { scaleY: 2 }), /Invalid size/);
  bad(piece('grid', 8, 1, { scaleX: 2, scaleY: 2, scale: 2 }), /Invalid size/);
  bad(piece('grid', 8, 1, { scaleX: 1, scaleY: 1 }), /Invalid size/);
  bad(piece('grid', 8, 1, { scaleX: 4.05, scaleY: 1 }), /Invalid size/);
  bad(piece('grid', 8, 1, { scaleX: Number.NaN, scaleY: 1 }), /Invalid size/);
  bad(piece('move-trigger', 8, 0, { scaleX: 2, scaleY: 2 }), /Invalid size/);
  bad(piece('ring', 8, 2, { touch: true }), /Invalid touch/);
  bad(piece('move-trigger', 8, 0, { multi: true }), /Invalid multi/);
  bad(piece('yellow-pad', 8, 0, { multi: true }), /Invalid multi/);
  bad(piece('grid', 8, 1, { multi: true }), /Invalid multi/);
  // a width and height piece of any type fits under the ceiling
  ok(piece('grid', 8, 5, { scaleX: 1, scaleY: 3 })); // top exactly at 7
  bad(piece('grid', 8, 5.5, { scaleX: 1, scaleY: 3 }), /above ceiling/);
});

test('rule 1d: a wide ring reaches an ellipse in its own frame, tested against the whole player box', () => {
  const at = (r, x, y) => inReach({ ...createState(level([r])), x, y }, r);
  // 2.5 by 1 at 10, 2: middle 10.5, 2.5, reach 1.5 across and 0.6 up and down
  const wide = piece('ring', 10, 2, { scaleX: 2.5, scaleY: 1 });
  assert.equal(at(wide, 11.9, 2.2), true, 'the box\'s near edge is inside though its middle is 1.72 out');
  assert.equal(at(piece('ring', 10, 2), 11.9, 2.2), false, 'the control: an unsized ring does not reach it');
  assert.equal(at(wide, 12, 2.2), true, 'tangent');
  assert.equal(at(wide, 12.01, 2.2), false, 'just past');
  assert.equal(at(wide, 10.2, 3.2), false, 'only 0.6 up');
  // turned a quarter, the long reach is up and down
  const tall = { ...wide, rotation: 90 };
  assert.equal(at(tall, 11.9, 2.2), false);
  assert.equal(at(tall, 10.2, 3.9), true);
  // a dash orb at 45 degrees: along its long axis it reaches, across it it does not
  const orb = piece('ring', 10, 2, { scaleX: 2.5, scaleY: 1, dash: true, rotation: 45 });
  assert.equal(at(orb, 10.5 + 0.92, 2.5 + 0.92), true);
  assert.equal(at(orb, 10.5 + 0.92, 2.5 - 0.92 - SIZE), false);
  // the ring readiness the step uses goes through the same test
  assert.equal(ringReady({ ...createState(level([wide])), x: 11.9, y: 2.2 }, wide, 0), true);
});

test('rule 5: a MULTI TOUCH ring works again once you have left it; inside it does nothing more; a plain ring stays used', () => {
  for (const multi of [true, false]) {
    const r = piece('ring', 5, 0, multi ? { multi: true } : {}),
      s = { ...createState(level([r], { height: 20 })), x: 4.8, y: 0.1, grounded: false };
    step(s, true, STEP, true);
    assert.deepEqual(s.usedRings, [0]);
    const vy = s.vy;
    // still inside, another tap: nothing
    step(s, false, STEP);
    step(s, true, STEP, true);
    assert.deepEqual(s.usedRings, [0]);
    assert.ok(s.vy < vy, 'falling, not launched again');
    // out of its reach: re-armed only if multi
    Object.assign(s, { x: 8, y: 0.1 });
    step(s, false, STEP);
    assert.deepEqual(s.usedRings, multi ? [] : [0]);
    Object.assign(s, { x: 4.8, y: 0.1, vy: 0 });
    step(s, true, STEP, true);
    assert.equal(s.vy > 0, multi, multi ? 'fires again' : 'a plain ring is once a run');
  }
  // a restart starts every ring fresh
  assert.deepEqual(createState(level([piece('ring', 5, 0, { multi: true })])).usedRings, []);
});

test('rule 4: a TOUCH trigger fires on overlap, not on passing its x; MULTI fires on each new touch and not while inside', () => {
  const build = (fields) => {
    const s = createState(validateLevel(level([piece('block', 20, 3, { group: 1 }), piece('move-trigger', 10, 1, { target: 1, moveY: 1, ...fields })])));
    return (x, y) => {
      Object.assign(s, { x, y });
      runTriggers(s, s.fx);
      return s.level.objects[0].y;
    };
  };
  // passed under it: a touch trigger does not fire, a pass trigger does
  assert.equal(build({ touch: true })(10.2, 0), 3);
  assert.equal(build({})(10.2, 0), 4);
  // touched: once
  const once = build({ touch: true });
  assert.equal(once(10.2, 0.5), 4);
  assert.equal(once(10.2, 3), 4);
  assert.equal(once(10.2, 0.5), 4, 'a touch trigger fires once a run');
  // multi: on each entry, never while inside
  const multi = build({ touch: true, multi: true });
  assert.equal(multi(10.2, 0.5), 4);
  assert.equal(multi(10.3, 0.6), 4, 'still inside');
  assert.equal(multi(10.3, 3), 4, 'out');
  assert.equal(multi(10.3, 0.5), 5, 'in again');
  // an edge that only touches is not an overlap
  assert.equal(build({ touch: true })(10.2, 1 - SIZE), 3);
  // an entry counts even with nothing to work on
  const empty = createState(validateLevel(level([piece('move-trigger', 10, 1, { touch: true, multi: true })])));
  Object.assign(empty, { x: 10.2, y: 0.5 });
  runTriggers(empty, empty.fx);
  assert.deepEqual([empty.fx.fired[0], empty.fx.inside[0]], [1, 1]);
});

test('rule 4a: a touch trigger\'s instant move changes that same step\'s contact; one not touched leaves the wall', () => {
  const run = (y) => {
    const s = createState(validateLevel(level([piece('block', 13, 0, { group: 1 }), piece('move-trigger', 10, y, { target: 1, moveY: 3, touch: true })])));
    while (s.status === 'playing' && s.x < 15) step(s, false);
    return s.status;
  };
  assert.equal(run(0), 'playing', 'touched on the floor: the wall is lifted out of the way');
  assert.equal(run(2), 'dead', 'the control: out of reach, it never fires');
});

test('rule 6: cdl2 carries the new fields and only they; cdl1 stays what it was and each prefix means one thing', async () => {
  const plain = level([piece('grid', 8, 1, { scale: 2 }), piece('ring', 12, 2)]);
  const old = await encodeLevel(plain);
  assert.match(old, /^cdl1\./);
  for (const o of [piece('grid', 8, 1, { scaleX: 2, scaleY: 0.5 }), piece('ring', 12, 2, { multi: true }), piece('color-trigger', 14, 0, { touch: true })]) {
    const lvl = level([o]),
      code = await encodeLevel(lvl);
    assert.match(code, /^cdl2\./);
    assert.deepEqual((await decodeLevel(code)).objects, lvl.objects);
  }
  // a cdl1 with a new field, or a cdl2 without one, is refused
  const raw = (prefix, value) => prefix + '0' + Buffer.from(JSON.stringify(value)).toString('base64url');
  await assert.rejects(() => decodeLevel(raw('cdl1.', level([piece('grid', 8, 1, { scaleX: 2, scaleY: 2 })]))), /Invalid level code/);
  await assert.rejects(() => decodeLevel(raw('cdl2.', plain)), /Invalid level code/);
  await assert.rejects(() => decodeLevel('cdl4.0AA'), /cdl1, cdl2 or cdl3/);
});
