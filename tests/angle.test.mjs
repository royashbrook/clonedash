import test from 'node:test';
import assert from 'node:assert/strict';
import { createState, step, STEP, SPEED, SIZE, DEATH_INSET, PORTALS, TYPES, object, validateLevel, bounds, parts, intersects } from '../src/engine.ts';
const empty = { name: 'Angle', length: 100, height: 10, objects: [] };
const angle = (extra = {}) => ({ ...createState(empty), mode: 'angle', x: 5, y: 4, vy: 0, grounded: false, ...extra });

test('angle climbs at exactly 45 degrees while held and dives at 45 when released, gravity ignored', () => {
  const s = angle();
  for (let i = 0; i < 30; i++) { const x = s.x, y = s.y; step(s, true); assert.ok(Math.abs((s.y - y) - (s.x - x)) < 1e-9, `climb tick ${i}`); }
  assert.equal(s.vy, SPEED);
  for (let i = 0; i < 30; i++) { const x = s.x, y = s.y; step(s, false); assert.ok(Math.abs((y - s.y) - (s.x - x)) < 1e-9, `dive tick ${i}`); }
  assert.equal(s.vy, -SPEED);
  assert.ok(Math.abs(s.y - 4) < 1e-9, 'a climb and an equal dive return to the start height');
});

test('inverted gravity mirrors the angle: holding heads for the floor', () => {
  const a = angle(), b = angle({ gravity: 1, y: 10 - SIZE - 4 });
  for (let i = 0; i < 120; i++) {
    const held = i % 40 < 20;
    step(a, held); step(b, held);
    assert.ok(Math.abs(a.y + b.y - (10 - SIZE)) < 1e-8, `tick ${i}`);
    assert.ok(Math.abs(a.vy + b.vy) < 1e-8);
  }
});

test('the world floor and ceiling stay safe slides in angle mode, in both gravities', () => {
  for (const gravity of [-1, 1]) {
    const floor = angle({ y: 0.2, gravity });
    for (let i = 0; i < 200; i++) step(floor, gravity > 0);
    assert.equal(floor.status, 'playing'); assert.equal(floor.y, 0);
    const ceiling = angle({ gravity });
    for (let i = 0; i < 400; i++) step(ceiling, gravity < 0);
    assert.equal(ceiling.status, 'playing'); assert.equal(ceiling.y, 10 - SIZE);
  }
});

// #106, docs/ramps-and-boosters.md rule 1: solid-object contact is deadly; world floor and ceiling
// remain safe. Each case is laid out for normal gravity and mirrored top to bottom for upside-down
// gravity, where the same input already heads the mirrored way.
const H = 10;
const mirror = (o) => {
  const b = bounds(o);
  return { ...o, y: o.y + (H - b.top) - b.bottom, flipY: !o.flipY, rotation: (360 - o.rotation) % 360 };
};
function fly(objects, start, held, gravity, steps = 60) {
  const level = { ...empty, objects: gravity < 0 ? objects : objects.map(mirror) },
    s = { ...createState(level), mode: 'angle', grounded: false, x: start.x, gravity, y: gravity < 0 ? start.y : H - SIZE - start.y };
  for (let i = 0; i < steps && s.status === 'playing'; i++) step(s, held);
  return s;
}
const touches = (s) => s.level.objects.some((o) => parts(o).some((p) => intersects(p, [[s.x, s.y], [s.x + SIZE, s.y], [s.x + SIZE, s.y + SIZE], [s.x, s.y + SIZE]])));
const CASES = {
  'landing on a block top': [[object('block', 6, 2)], { x: 5.5, y: 3.3 }, false],
  'a block underside': [[object('block', 6, 6)], { x: 5.5, y: 6 - SIZE - 0.3 }, true],
  'a block side': [[0, 1, 2, 3, 4, 5, 6, 7, 8].map((y) => object('block', 7, y)), { x: 5.5, y: 4 }, true],
  'a turned block': [[{ ...object('block', 6, 2), rotation: 45 }], { x: 5.9, y: 3.6 }, false],
  'a ramp from the floor': [[object('ramp', 7, 0)], { x: 5, y: 0 }, false],
  'a scoop from the floor': [[object('scoop', 7, 0)], { x: 5, y: 0 }, false],
  'a hill from the floor': [[object('hill', 7, 0)], { x: 5, y: 0 }, false],
  'landing on a ramp': [[object('ramp-grid', 6, 2)], { x: 6.2, y: 3.6 }, false],
};
for (const [name, [objects, start, held]] of Object.entries(CASES))
  test(`angle dies on solid contact: ${name}, both gravities, before any support snap`, () => {
    for (const gravity of [-1, 1]) {
      const s = fly(objects, start, held, gravity);
      assert.equal(s.status, 'dead', `gravity ${gravity}`);
      assert.equal(s.mode, 'angle');
      assert.ok(touches(s), 'the death is a contact with the piece');
    }
  });

test('the explicit overrides keep their meaning on the angle: a W side hit stops, an R head hit bumps', () => {
  const column = (extra) => [0, 1, 2, 3].map((y) => ({ ...object('block', 7, y), ...extra }));
  for (const gravity of [-1, 1])
    for (const [label, pieces] of [
      ['wall pass', column({ wallPass: true })],
      ['W zone', [...column(), ...column().map((o) => ({ ...o, type: 'w-block' }))]],
    ]) {
      // a side hit waits at the same face every mode waits at, climbs, and carries on over the top
      const held = fly(pieces, { x: 5.5, y: 2 }, true, gravity, 30);
      assert.equal(held.status, 'playing', `${label} ${gravity}`);
      assert.equal(held.wall, 7);
      assert.equal(held.x, 7 - SIZE + DEATH_INSET);
      const over = fly(pieces, { x: 5.5, y: 2 }, true, gravity, 120);
      assert.equal(over.status, 'playing', `${label} ${gravity} climbs over`);
      assert.ok(over.x > 8);
      // landing on it is not a side hit
      assert.equal(fly(pieces, { x: 6.6, y: 4.3 }, false, gravity).status, 'dead', `${label} ${gravity} top`);
    }
  const roof = (extra) => [7, 8].map((x) => ({ ...object('block', x, 6), ...extra }));
  for (const gravity of [-1, 1])
    for (const [label, pieces] of [
      ['roof pass', roof({ roofPass: true })],
      ['R zone', [...roof(), ...roof().map((o) => ({ ...o, type: 'r-block' }))]],
    ]) {
      // the head meets the face: held there, sliding along it, alive
      const bumped = fly(pieces, { x: 7, y: 6 - SIZE - 0.2 }, true, gravity, 30);
      assert.equal(bumped.status, 'playing', `${label} ${gravity}`);
      assert.ok(Math.abs((gravity < 0 ? bumped.y : H - SIZE - bumped.y) - (6 - SIZE)) < 1e-9, 'held under the face');
      // the feet meeting it is a landing, and a side hit on it is still a wall
      assert.equal(fly(pieces, { x: 6.6, y: 7.3 }, false, gravity).status, 'dead', `${label} ${gravity} top`);
      assert.equal(fly(pieces, { x: 5.5, y: 6.4 }, false, gravity).status, 'dead', `${label} ${gravity} side`);
    }
  // both on one block: the side stops, the head bumps
  const both = column({ wallPass: true, roofPass: true });
  assert.equal(fly(both, { x: 5.5, y: 2 }, true, -1, 30).wall, 7);
});

test('the angle passes through background and NO TOUCH pieces, and a HIDDEN piece still kills', () => {
  for (const gravity of [-1, 1]) {
    for (const extra of [{ layer: 'background' }, { noTouch: true }])
      assert.equal(fly([{ ...object('block', 6, 2), ...extra }], { x: 5.5, y: 3.3 }, false, gravity).status, 'playing');
    assert.equal(fly([{ ...object('block', 6, 2), hidden: true }], { x: 5.5, y: 3.3 }, false, gravity).status, 'dead');
  }
});

test('spikes kill the angle as before', () => {
  assert.equal(fly([object('spike', 7, 0)], { x: 5, y: 0 }, false, -1).status, 'dead');
});

test('the angle portal switches mode, is a portal for placement and validation, and keeps gravity', () => {
  assert.ok(PORTALS.includes('angle')); assert.ok(TYPES.includes('angle'));
  for (const gravity of [-1, 1]) {
    const s = { ...createState({ ...empty, objects: [object('angle', 3, 2)] }), x: 2.5, y: 3, gravity, grounded: false };
    step(s, false); assert.equal(s.mode, 'angle'); assert.equal(s.gravity, gravity);
    step(s, true); assert.equal(s.vy, -gravity * SPEED);
  }
  assert.doesNotThrow(() => validateLevel({ ...empty, objects: [object('angle', 10, 1)] }));
  assert.throws(() => validateLevel({ ...empty, objects: [{ ...object('angle', 10, 1), rotation: 45 }] }), /Invalid object/);
  assert.throws(() => validateLevel({ ...empty, objects: [{ ...object('angle', 10, 1), scale: 2 }] }), /Invalid scale/);
});
