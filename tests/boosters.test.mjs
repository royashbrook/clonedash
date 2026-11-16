import test from 'node:test';
import assert from 'node:assert/strict';
import { createState, step, STEP, GRAVITY, JUMP, FALL, SIZE, DROP_SPEED, PADS, PAD_EFFECTS, object, validateLevel, ringReady } from '../src/engine.ts';
import { encodeLevel, decodeLevel } from '../src/transfer.ts';

// #106, docs/ramps-and-boosters.md rules 3 and 4: the black and gray rings, and boosters.
const level = (objects, extra = {}) => ({ name: 'Boosters', length: 80, objects, ...extra });
const ring = (x, y, extra = {}) => ({ ...object('ring', x, y), ...extra });
// their own pieces, so an older copy refuses them (rule 7)
const black = (x, y) => ({ ...object('drop-ring', x, y), color: '#000000' });
const gray = (x, y) => ({ ...object('stop-ring', x, y), color: '#9a9a9a' });
// a run in the air on a ring, moving the given way
const airborne = (objects, extra = {}) => ({ ...createState(level(objects)), x: 5, y: 3, vy: 8, grounded: false, ...extra });
const close = (a, b) => Math.abs(a - b) < 1e-9;

test('a black ring sends you down at DROP_SPEED the way gravity pulls, a gray one stops you; a fresh tap, once per run', () => {
  assert.equal(DROP_SPEED, 24);
  for (const gravity of [-1, 1]) {
    const drop = airborne([black(5, 3)], { gravity, vy: -gravity * 8 });
    step(drop, true, STEP, true);
    assert.deepEqual(drop.usedRings, [0]);
    assert.ok(close(drop.vy, gravity * DROP_SPEED + gravity * GRAVITY * STEP), `drop, gravity ${gravity}: ${drop.vy}`);
    const stop = airborne([gray(5, 3)], { gravity, vy: -gravity * 8 });
    step(stop, true, STEP, true);
    assert.ok(close(stop.vy, gravity * GRAVITY * STEP), 'stopped once, then gravity carries on');
    step(stop, false);
    assert.ok(close(stop.vy, 2 * gravity * GRAVITY * STEP), 'not a hover');
  }
  // a hold that is not a fresh tap does nothing, and a used ring never fires again
  const held = airborne([black(5, 3)]);
  step(held, true, STEP, false);
  assert.deepEqual(held.usedRings, []);
  step(held, true, STEP, true);
  const vy = held.vy;
  held.vy = 8;
  step(held, true, STEP, true);
  assert.ok(vy < 0 && close(held.vy, 8 - GRAVITY * STEP), 'once per run');
});

test('a drop or stop ring is the step\'s word on speed: it beats that step\'s pogo jump and ends a dash; the plane limit applies after', () => {
  // pogo: a fresh tap on a black ring is a drop, not a pogo jump; the yellow ring keeps its old order
  const pogo = airborne([black(5, 3)], { mode: 'pogo' });
  step(pogo, true, STEP, true);
  assert.ok(close(pogo.vy, -DROP_SPEED - GRAVITY * STEP));
  const yellow = airborne([ring(5, 3)], { mode: 'pogo' });
  step(yellow, true, STEP, true);
  assert.ok(close(yellow.vy, JUMP - GRAVITY * STEP), 'the yellow ring is untouched');
  // a dash in progress ends; a yellow ring under a dash still loses to the dash, as before
  const dashing = airborne([gray(5, 3)], { dash: 0.5 });
  step(dashing, true, STEP, true);
  assert.equal(dashing.dash, null);
  assert.ok(close(dashing.vy, -GRAVITY * STEP));
  const legacy = airborne([ring(5, 3)], { dash: 0.5 });
  step(legacy, true, STEP, true);
  assert.equal(legacy.dash, 0.5);
  // a plane caps it at 4 blocks a second
  const plane = airborne([black(5, 3)], { mode: 'plane' });
  step(plane, false, STEP, true);
  assert.equal(plane.vy, -4);
});

test('in angle mode a black or gray ring is not ready and the tap is left unused; a yellow ring still fires', () => {
  for (const r of [black(5, 3), gray(5, 3)]) {
    const s = airborne([r], { mode: 'angle' });
    assert.equal(ringReady(s, r, 0), false);
    step(s, true, STEP, true);
    assert.deepEqual(s.usedRings, []);
    assert.equal(s.vy, 5);
  }
  const s = airborne([ring(5, 3)], { mode: 'angle' });
  assert.equal(ringReady(s, s.level.objects[0], 0), true);
});

test('a portal touched later in the same step sets its own speed over a black ring\'s, as over the yellow ring\'s', () => {
  const flip = airborne([black(5, 3), object('gravity-up', 5, 2)]);
  step(flip, true, STEP, true);
  assert.deepEqual(flip.usedRings, [0]);
  assert.equal(flip.gravity, 1);
  assert.equal(flip.vy, FALL);
  const plane = airborne([gray(5, 3), object('plane', 5, 2)]);
  step(plane, true, STEP, true);
  assert.equal(plane.mode, 'plane');
  assert.equal(plane.vy, 3);
});

test('every reader refuses a black or gray ring mixed with another effect: bounce, gravity, boost and dash are plain ring fields', () => {
  const ok = level([black(10, 2), gray(12, 2), { ...object('stop-ring', 14, 2) }, { ...black(16, 2), scale: 2, hidden: true, group: 3 }]);
  assert.deepEqual(validateLevel(ok), ok);
  for (const [bad, refusal] of [
    [{ ...black(10, 2), bounce: 3 }, /Invalid ring bounce/],
    [{ ...gray(10, 2), flipsGravity: true }, /Invalid gravity ring/],
    [{ ...gray(10, 2), flipsGravity: true, boost: true }, /Invalid gravity ring/],
    [{ ...black(10, 2), dash: true }, /Invalid dash orb/],
    [{ ...black(10, 2), rotation: 45 }, /Invalid object/],
    [{ ...object('yellow-pad', 10, 2), color: '#000000' }, /Invalid ring colour/],
  ])
    assert.throws(() => validateLevel(level([bad])), refusal, JSON.stringify(bad));
});

test('a share code keeps the black and gray rings and every booster', async () => {
  const pads = PADS.map((type, i) => object(type, 10 + i, 0)),
    authored = level([black(5, 2), gray(7, 2), ...pads]);
  assert.deepEqual(await decodeLevel(await encodeLevel(authored)), { ...authored, song: 9 });
});

// a run on the floor, about to cross a booster
const onFloor = (objects, extra = {}) => ({ ...createState(level(objects)), x: 4.6, y: 0, grounded: true, ...extra });
const until = (s, done, held = false, n = 60) => {
  for (let i = 0; i < n && s.status === 'playing' && !done(s); i++) step(s, held);
  return s;
};

test('each booster does what its ring does, with no tap', () => {
  const expected = {
    'yellow-pad': [-1, JUMP],
    'pink-pad': [-1, Math.sqrt(2 * GRAVITY * 1)],
    'red-pad': [-1, Math.sqrt(2 * GRAVITY * 5)],
    'blue-pad': [1, FALL],
    'green-pad': [1, -JUMP],
    'black-pad': [-1, -DROP_SPEED],
    'gray-pad': [-1, 0],
  };
  assert.deepEqual(Object.keys(PAD_EFFECTS), PADS);
  assert.deepEqual(Object.keys(expected), PADS);
  for (const type of PADS) {
    const s = until(onFloor([object(type, 5, 0)]), (s) => s.fx.pads.length);
    assert.deepEqual(s.fx.pads, [0], type);
    assert.deepEqual([s.gravity, s.vy], expected[type], type);
    assert.equal(s.status, 'playing');
  }
});

test('a booster fires once per touch, and again after the body has left it, not once per run', () => {
  const s = onFloor([object('gray-pad', 5, 3)], { x: 5, y: 3, grounded: false }),
    hover = () => {
      s.y = 3;
      s.vy = 5;
      step(s, false);
      return s.vy;
    };
  // a booster sets the speed at the end of the step, after gravity
  assert.equal(hover(), 0, 'first touch fires');
  assert.ok(close(hover(), 5 - GRAVITY * STEP), 'still touching: silent');
  s.y = 5;
  step(s, false);
  assert.deepEqual(s.fx.pads, [], 'left it');
  assert.equal(hover(), 0, 'back on it: fires again');
});

test('one booster a step: the first touched in authored order fires, the rest count as touched', () => {
  for (const [first, second, vy] of [['yellow-pad', 'red-pad', JUMP], ['red-pad', 'yellow-pad', Math.sqrt(2 * GRAVITY * 5)]]) {
    const s = until(onFloor([object(first, 5, 0), object(second, 5, 0)]), (s) => s.fx.pads.length);
    assert.deepEqual(s.fx.pads, [0, 1]);
    assert.equal(s.vy, vy);
    step(s, false);
    assert.ok(close(s.vy, vy - GRAVITY * STEP), 'neither fires again while touched');
  }
  // two flips touched together flip once
  const s = until(onFloor([object('blue-pad', 5, 0), object('blue-pad', 5, 0)]), (s) => s.fx.pads.length);
  assert.equal(s.gravity, 1);
});

test('a ring tapped in the step a booster fires: the booster has the last word; a booster ends a dash', () => {
  const both = onFloor([object('gray-pad', 5, 0), ring(5, 0)], { x: 5 });
  step(both, true, STEP, true);
  assert.deepEqual(both.usedRings, [1]);
  assert.equal(both.vy, 0);
  const dashing = onFloor([object('yellow-pad', 5, 0)], { x: 5, y: 0.1, grounded: false, dash: 0.3 });
  step(dashing, true);
  assert.equal(dashing.dash, null);
  assert.equal(dashing.vy, JUMP);
});

test('boosters are inert in angle mode, a NO TOUCH one never fires, a HIDDEN one does, a booster on a ceiling turns over', () => {
  // an angle climbing through the strip
  const angle = onFloor([object('red-pad', 5, 0)], { mode: 'angle', grounded: false, x: 5, y: 0.02 });
  for (let i = 0; i < 4; i++) {
    step(angle, true);
    assert.equal(angle.vy, 5);
    assert.deepEqual(angle.fx.pads, []);
  }
  assert.ok(angle.y < 0.25, 'still over the strip');
  const noTouch = until(onFloor([{ ...object('yellow-pad', 5, 0), noTouch: true }]), (s) => s.vy > 0, false, 30);
  assert.equal(noTouch.vy, 0);
  const hidden = until(onFloor([{ ...object('yellow-pad', 5, 0), hidden: true }]), (s) => s.vy > 0);
  assert.equal(hidden.vy, JUMP);
  // upside down on the ceiling of a 7 high level, a booster turned 180 in the top cell
  const ceiling = until(onFloor([{ ...object('yellow-pad', 5, 6), rotation: 180 }], { gravity: 1, y: 7 - SIZE }), (s) => s.fx.pads.length);
  assert.deepEqual(ceiling.fx.pads, [0]);
  assert.equal(ceiling.vy, -JUMP, 'bounced away from the ceiling');
  // the same booster unturned sits at the bottom of that cell, out of reach
  const unturned = until(onFloor([object('yellow-pad', 5, 6)], { gravity: 1, y: 7 - SIZE }), () => false, false, 30);
  assert.deepEqual(unturned.fx.pads, []);
  // an unbacked booster in the air is a valid piece and fires all the same
  assert.doesNotThrow(() => validateLevel(level([object('pink-pad', 10, 4)])));
});

// docs/coins-and-triggers.md rule 2: an instant move makes contact run again from the state before
// it. Rule 4f: the boosters touched before the step, the speed, gravity and dash go back too.
const move = (x, moveY, target = 1) => ({ ...object('move-trigger', x, 0), target, moveY });
test('an instant move puts a booster under the run in the step it fires: the booster fires once, in the second pass', () => {
  const s = onFloor([move(5, -3), { ...object('yellow-pad', 6, 3), group: 1 }], { x: 5.8 });
  step(s, false);
  assert.equal(s.level.objects[1].y, 0);
  assert.deepEqual(s.fx.pads, [1]);
  assert.equal(s.vy, JUMP);
  step(s, false);
  assert.ok(close(s.vy, JUMP - GRAVITY * STEP), 'not again');
});

test('a booster an instant move takes away in that step has not fired, and the dash it would have ended goes on', () => {
  const s = onFloor([move(5, 3), { ...object('blue-pad', 6, 0), group: 1 }], { x: 5.8, y: 0.1, grounded: false, dash: 0.2 });
  step(s, true);
  assert.equal(s.level.objects[1].y, 3);
  assert.deepEqual(s.fx.pads, []);
  assert.equal(s.gravity, -1, 'no flip');
  assert.equal(s.dash, 0.2, 'the dash goes on');
});

test('a booster first touched in a step where an instant move goes elsewhere fires exactly once', () => {
  const s = onFloor([move(5, 2), { ...object('block', 30, 0), group: 1 }, object('blue-pad', 6, 0)], { x: 5.8 });
  step(s, false);
  assert.equal(s.level.objects[1].y, 2, 'the move happened');
  assert.deepEqual(s.fx.pads, [2]);
  assert.equal(s.gravity, 1, 'flipped once, not twice');
  assert.equal(s.vy, FALL);
});

// rule 4a: a booster is touched by where the run ends up after every portal and support, not by
// where it was partway through the contact pass
test('a booster is touched by the final pose: a plane portal that lifts the run off it first means no fire, in either authored order', () => {
  for (const objects of [[object('yellow-pad', 5, 0), object('plane', 5, 0)], [object('plane', 5, 0), object('yellow-pad', 5, 0)]]) {
    const s = { ...createState(level(objects)), x: 5, y: 0, vy: 0, grounded: true };
    step(s, false);
    assert.equal(s.mode, 'plane', objects[0].type);
    assert.equal(s.y > 0.25, true, 'lifted clear of the strip');
    assert.equal(s.vy, 3, `${objects[0].type} first: the plane's speed, no bounce`);
    assert.deepEqual(s.fx.pads, [], `${objects[0].type} first: nothing touched`);
  }
});

// rule 3b: the plane's limit holds in the step a booster fires, as it does for a ring
test('in a plane the speed limit holds in the step a booster fires: a black or yellow booster leaves at most 4, and the next step travels as a capped run', () => {
  for (const [type, cap] of [['black-pad', -4], ['yellow-pad', 4]]) {
    const s = { ...createState(level([object(type, 5, 3)])), mode: 'plane', x: 5, y: 3.1, vy: 0, grounded: false };
    step(s, false);
    assert.deepEqual(s.fx.pads, [0], `${type} fired`);
    assert.equal(s.vy, cap, `${type}: held to the plane's limit at the end of the firing step`);
    // the next step, released: a capped run moves cap * STEP plus the plane's fall of 12
    const y = s.y;
    step(s, false);
    assert.ok(close(s.y - y, cap * STEP - 6 * STEP * STEP), `${type}: next step travel ${s.y - y}`);
  }
});

test('a level with no booster, coin or trigger has no run effects', () => {
  assert.equal('fx' in createState(level([ring(5, 2), black(7, 2)])), false);
  assert.ok(createState(level([object('gray-pad', 5, 0)])).fx);
});
