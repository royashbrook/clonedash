import test from 'node:test';
import assert from 'node:assert/strict';
import { createState, step, SIZE, DEATH_INSET, SPEED, JUMP, DASH_LIMIT, dashClimb, object, validateLevel } from '../src/engine.ts';
import { encodeLevel, decodeLevel } from '../src/transfer.ts';

// EDIT OBJECT switches (#90), the green ring (#89) and the pink dash orb (#91).
const level = (objects) => ({ name: 'Objects', length: 40, height: 10, objects });
const run = (s, ticks, held = false) => { for (let i = 0; i < ticks && s.status === 'playing'; i++) step(s, typeof held === 'function' ? held(i) : held); return s; };
const wall = (extra = {}) => [0, 1, 2].map(y => ({ ...object('grid', 6, y), ...extra }));

test('NO TOUCH: drawn, never collides, never fires', () => {
  assert.equal(run(createState(level(wall())), 240).status, 'dead', 'the control: a wall kills');
  const through = run(createState(level(wall({ noTouch: true }))), 240);
  assert.equal(through.status, 'playing'); assert.ok(through.x > 9, 'ran straight through');
  assert.equal(run(createState(level([{ ...object('spike', 6, 0), noTouch: true }])), 240).status, 'playing', 'a no touch spike');
  const portal = run(createState(level([{ ...object('plane', 6, 0), noTouch: true }])), 240);
  assert.equal(portal.mode, 'square', 'a no touch portal does nothing');
  const s = { ...createState(level([{ ...object('ring', 5, 3), noTouch: true }])), x: 5, y: 3, grounded: false, vy: 0 };
  step(s, true);
  assert.deepEqual(s.usedRings, [], 'a no touch ring cannot be used');
});

test('WALL PASS: its side holds the run like a W; ROOF PASS: a head hit bumps like an R', () => {
  const held = run(createState(level(wall({ wallPass: true }))), 300);
  assert.equal(held.status, 'playing');
  assert.equal(held.x, 6 - SIZE + DEATH_INSET, 'held against the wall face');
  assert.equal(held.wall, 6);
  // only the piece that has it: a plain wall right behind still kills
  assert.equal(run(createState(level([...wall().slice(0, 1), ...wall({ wallPass: true }).slice(1)])), 300).status, 'dead');
  const roof = (extra) => Array.from({ length: 12 }, (_, i) => ({ ...object('grid', 6 + i, 2), ...extra }));
  const jump = (objects) => {
    const s = { ...createState(level(objects)), x: 7 };
    let top = 0;
    for (let i = 0; i < 200 && s.status === 'playing'; i++) { step(s, i < 3); if (s.x < 18) top = Math.max(top, s.y); }
    return { s, top };
  };
  assert.equal(jump(roof({})).s.status, 'dead', 'the control: a head hit kills');
  const { s, top } = jump(roof({ roofPass: true }));
  assert.equal(s.status, 'playing'); assert.equal(top, 2 - SIZE, 'bumped flush under it'); assert.ok(s.x > 15);
});

test('the green ring flips gravity and bounces you away from the new gravity (#95)', () => {
  const green = { ...object('ring', 5, 3), color: '#9aff6b', flipsGravity: true, boost: true };
  const s = { ...createState(level([green])), x: 5, y: 3, grounded: false, vy: 0 };
  step(s, true);
  assert.equal(s.gravity, 1, 'flipped, gravity now pulls up');
  assert.ok(s.vy < -JUMP * 0.9, `bounced down the screen, away from it, vy=${s.vy}`);
  let lowest = s.y;
  run(s, 200, () => { lowest = Math.min(lowest, s.y); return false; });
  assert.ok(lowest < 3 - 2, `a full yellow ring jump down, lowest y=${lowest}`);
  assert.equal(s.status, 'playing'); assert.equal(s.y, 10 - SIZE, 'then up on the ceiling');
  // and upside down it bounces up the screen
  const flipped = { ...createState(level([green])), x: 5, y: 3, gravity: 1, grounded: false, vy: 0 };
  step(flipped, true);
  assert.equal(flipped.gravity, -1); assert.ok(flipped.vy > JUMP * 0.9);
});

test('HIDDEN: never drawn in play, still collides, faint in the editor (#96)', async () => {
  assert.equal(run(createState(level(wall({ hidden: true }))), 240).status, 'dead', 'a hidden wall still kills');
  const floor = { ...createState(level([5, 6, 7].map(x => ({ ...object('block', x, 2), hidden: true })))), x: 5, y: 4, grounded: false };
  run(floor, 60);
  assert.equal(floor.y, 3, 'and still holds you up');
  for (const piece of [object('block', 10, 1), object('spike', 10, 0), object('ring', 10, 2), object('plane', 10, 0), object('ramp', 10, 0)]) {
    const ok = level([{ ...piece, hidden: true }]);
    assert.deepEqual(validateLevel(ok), ok);
    assert.equal((await decodeLevel(await encodeLevel(ok))).objects[0].hidden, true, 'the share code keeps it');
  }
  for (const bad of [{ ...object('block', 10, 1), hidden: false }, { ...object('block', 10, 1), hidden: 1 }, { ...object('w-block', 10, 1), hidden: true }])
    assert.throws(() => validateLevel(level([bad])), /Invalid hidden/);
  assert.equal('hidden' in (await decodeLevel(await encodeLevel(level([object('block', 10, 1)])))).objects[0], false);
});

test('the dash orb: held, the run goes the way it points with no gravity, until let go', () => {
  for (const rotation of [0, 30, 330]) {
    const orb = { ...object('ring', 5, 3), color: '#ff8ac4', dash: true, rotation };
    const s = { ...createState(level([orb])), x: 5, y: 3, grounded: false, vy: 0 };
    run(s, 30, true);
    const climb = Math.tan((((rotation + 180) % 360) - 180) * Math.PI / 180);
    assert.equal(s.status, 'playing');
    assert.ok(Math.abs((s.y - 3) - climb * (s.x - 5)) < 0.05, `${rotation}°: a straight line, y=${s.y} x=${s.x}`);
    // let go: gravity takes over again
    const vy = s.vy; step(s, false); step(s, false);
    assert.ok(s.vy < vy, `${rotation}°: falling again`); assert.equal(s.dash, null);
  }
  // it starts on a hold, not only a fresh tap, and an aim past 70 degrees is held to 70
  const steep = { ...object('ring', 5, 1), dash: true, rotation: 90 };
  assert.equal(dashClimb(steep), Math.tan(DASH_LIMIT * Math.PI / 180));
  assert.ok(Math.abs(dashClimb({ ...steep, rotation: 180 })) < 1e-12, 'pointing back is straight ahead');
  assert.ok(Math.abs(dashClimb({ ...steep, rotation: 135 }) - 1) < 1e-12, 'up and back is up and ahead');
  assert.ok(Math.abs(dashClimb({ ...steep, rotation: 225 }) + 1) < 1e-12, 'down and back is down and ahead');
  const s = { ...createState(level([steep])), x: 4, y: 1, grounded: false, vy: 0, inputHeld: true };
  run(s, 20, true);
  assert.ok(s.dash !== null, 'picked up by a hold that began before the orb');
  assert.ok(Math.abs(s.vy - dashClimb(steep) * SPEED) < 1e-9);
});

test('the yellow dash orb dashes the same and flips gravity as it starts', () => {
  const orb = { ...object('ring', 5, 3), dash: true, flipsGravity: true, rotation: 20 };
  const s = { ...createState(level([orb])), x: 5, y: 3, grounded: false, vy: 0 };
  run(s, 20, true);
  assert.equal(s.gravity, 1, 'flipped once, not every step');
  assert.ok(Math.abs(s.vy - dashClimb(orb) * SPEED) < 1e-9, 'dashing');
  step(s, false); step(s, false);
  assert.ok(s.vy > dashClimb(orb) * SPEED, 'let go: falling up');
});

test('the new fields validate, keep through a share code, and stay off old pieces', async () => {
  const ok = level([
    { ...object('ring', 10, 1), flipsGravity: true, boost: true },
    { ...object('ring', 12, 1), dash: true, rotation: 37 },
    { ...object('ring', 13, 1), dash: true, flipsGravity: true, rotation: 300 },
    { ...object('spike', 14, 0), noTouch: true },
    { ...object('block', 16, 0), wallPass: true, roofPass: true },
    { ...object('ramp', 18, 0), wallPass: true },
  ]);
  assert.deepEqual(validateLevel(ok), ok);
  for (const [bad, message] of [
    [{ ...object('ring', 10, 1), boost: true }, /gravity ring/],
    [{ ...object('ring', 10, 1), dash: true, flipsGravity: true, boost: true }, /dash orb/],
    [{ ...object('ring', 10, 1), dash: true, bounce: 2 }, /dash orb/],
    [{ ...object('block', 10, 1), dash: true }, /dash orb/],
    [{ ...object('ring', 10, 1), rotation: 37 }, /Invalid object/],
    [{ ...object('w-block', 10, 1), noTouch: true }, /no touch/],
    [{ ...object('spike', 10, 1), wallPass: true }, /wall pass/],
    [{ ...object('ramp', 10, 1), roofPass: true }, /roof pass/],
    [{ ...object('block', 10, 1), noTouch: 1 }, /no touch/],
  ]) assert.throws(() => validateLevel(level([bad])), message);
  const back = (await decodeLevel(await encodeLevel(ok))).objects;
  assert.deepEqual(back, ok.objects);
  const plain = (await decodeLevel(await encodeLevel(level([object('block', 10, 0)])))).objects[0];
  for (const key of ['boost', 'dash', 'noTouch', 'wallPass', 'roofPass']) assert.equal(key in plain, false, key);
});
