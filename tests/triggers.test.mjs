import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { createState, step, object, validateLevel, tintOf, polygon, duplicateObject, STEP } from '../src/engine.ts';
import { duplicateGroup } from '../src/group.ts';
import { encodeLevel, decodeLevel } from '../src/transfer.ts';
import { readSave, storeDraft, newLevel } from '../src/library.ts';
import { LEVELS } from '../src/levels.ts';
import { Run } from '../src/run.ts';
import { render } from '../src/render.ts';

// Group ids, move triggers and colour triggers (#101). docs/coins-and-triggers.md is the contract.
const COURSES = structuredClone(LEVELS);
after(() => assert.deepEqual(LEVELS, COURSES, 'no run in this file changed a built-in course'));

const level = (objects, length = 40) => ({ name: 'Triggers', length, objects });
const block = (x, y, group) => ({ ...object('block', x, y), ...(group && { group }) });
const trigger = (type, x, fields) => ({ ...object(type, x, 0), ...fields });
const move = (x, fields) => trigger('move-trigger', x, fields);
const paint = (x, fields) => trigger('color-trigger', x, fields);
// steps with no input until the player's x reaches x (the step that crosses it fires its triggers)
const until = (s, x) => {
  while (s.status === 'playing' && s.x < x) step(s, false);
  return s;
};
const finish = (s) => {
  for (let i = 0; i < 20000 && s.status === 'playing'; i++) step(s, false);
  return s;
};
const pose = (s, i) => [s.level.objects[i].x, s.level.objects[i].y];
const near = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) <= eps, `${a} is not ${b}`);

test('group ids: 1 to 99 on any piece but a trigger; triggers take a target, a move or colour and a time', () => {
  const ok = level([block(10, 1, 1), { ...object('spike', 12, 0), group: 99 }, { ...object('ring', 14, 2), group: 5 }, { ...object('coin', 16, 1), group: 2 },
    move(6, { target: 1, moveX: -3, moveY: 2, duration: 1.5 }), paint(7, { target: 2, color: '#53e3ff', duration: 0 }), move(8, {})]);
  assert.deepEqual(validateLevel(ok), ok);
  for (const [bad, message] of [
    [{ ...block(10, 1), group: 0 }, /group/], [block(10, 1, 100), /group/], [block(10, 1, 1.5), /group/], [{ ...block(10, 1), group: '3' }, /group/],
    [move(6, { group: 1 }), /group/], [paint(6, { group: 1 }), /group/], // nothing moves a trigger
    [block(10, 1, 1), null], // control: fine
    [{ ...block(10, 1), target: 1 }, /trigger group/], [move(6, { target: 0 }), /trigger group/], [move(6, { target: 100 }), /trigger group/],
    [move(6, { moveX: 1.5 }), /move/], [move(6, { moveX: 41 }), /move/], [move(6, { moveY: -8 }), /move/], [move(6, { moveX: Infinity }), /move/], [move(6, { moveY: NaN }), /move/],
    [paint(6, { moveX: 1 }), /move/], [{ ...block(10, 1), moveY: 1 }, /move/],
    [move(6, { duration: -1 }), /time/], [move(6, { duration: 31 }), /time/], [move(6, { duration: Infinity }), /time/], [{ ...block(10, 1), duration: 1 }, /time/],
    [paint(6, { color: 'red' }), /colour/], [move(6, { color: '#ffffff' }), /colour/],
    [move(6, { hidden: true }), /hidden/], [paint(6, { noTouch: true }), /no touch/],
  ]) {
    if (message) assert.throws(() => validateLevel(level([bad])), message, JSON.stringify(bad));
    else assert.doesNotThrow(() => validateLevel(level([bad])));
  }
  assert.doesNotThrow(() => validateLevel(level([move(6, { moveX: 40, moveY: -7 })])), 'as far as the level is long and tall');
});

test('group ids round trip through a save, a share code, copy + paste and EDIT A COPY, and stay level-local', async () => {
  const l = { ...level([block(10, 1, 7), move(6, { target: 7, moveX: 2, duration: 0.5 }), paint(5, { target: 7, color: '#c77dff' })]), song: 9 };
  // share code (also the path EDIT A COPY takes: importLevel -> appendLevel -> the same whitelist)
  assert.deepEqual(await decodeLevel(await encodeLevel(l)), l);
  // save
  const save = readSave(null, 23);
  storeDraft(save, l);
  const back = readSave(JSON.stringify(save), 23);
  assert.deepEqual(back.draft, l);
  assert.deepEqual(back.customLevels[0].level, l);
  // a second level can use the same id for something else: there is no global registry
  newLevel(back);
  storeDraft(back, level([block(12, 2, 7)]));
  assert.deepEqual(readSave(JSON.stringify(back), 23).customLevels[0].level, l);
  // copies keep membership, one piece or a group
  assert.equal(duplicateObject(l, 0).group, 7);
  const copies = duplicateGroup(l, [0, 1]);
  assert.deepEqual(copies.map((o) => [o.type, o.group, o.target]), [['block', 7, undefined], ['move-trigger', undefined, 7]]);
});

test('move trigger: an instant move by the offset, negative too, once, on the run copy only', () => {
  const l = level([block(12, 3, 1), move(5, { target: 1, moveX: -2, moveY: 1 }), block(20, 3, 2)]);
  const authored = structuredClone(l);
  const s = until(createState(l), 5);
  assert.equal(s.fx.fired[1], 1);
  assert.deepEqual(pose(s, 0), [10, 4], 'moved left 2 and up 1 in the step that crossed it');
  assert.deepEqual(pose(s, 2), [20, 3], 'another group stays put');
  for (let i = 0; i < 600; i++) step(s, false);
  assert.deepEqual(pose(s, 0), [10, 4], 'fired once: crossing it again and again would keep moving the block');
  finish(s);
  assert.equal(s.status, 'complete');
  assert.deepEqual(l, authored, 'the authored level never moved');
  assert.notEqual(s.level.objects[0], l.objects[0]);
});

test('move trigger: time spreads the move evenly over that many seconds of the run clock', () => {
  const l = level([block(12, 3, 1), move(5, { target: 1, moveX: 4, moveY: -2, duration: 1 })]);
  const s = until(createState(l), 5);
  const fired = s.time;
  assert.deepEqual(pose(s, 0), [12, 3], 'a timed move starts where the block is');
  for (let i = 0; i < 60; i++) step(s, false);
  const t = s.time - fired;
  near(pose(s, 0)[0], 12 + 4 * t);
  near(pose(s, 0)[1], 3 - 2 * t);
  near(t, 0.5, 1e-6);
  for (let i = 0; i < 62; i++) step(s, false);
  assert.deepEqual(pose(s, 0), [16, 1], 'ends exactly on the offset');
  assert.deepEqual(s.fx.movers, [], 'and stops working');
});

test('collisions use the moved pose: a block moved out of the path is passed, one moved into it kills', () => {
  const inPath = [block(12, 0, 1)];
  assert.equal(finish(createState(level(inPath))).status, 'dead', 'control: the block in the path kills');
  assert.equal(finish(createState(level([...inPath, move(5, { target: 1, moveY: 3 })]))).status, 'complete');
  assert.equal(finish(createState(level([...inPath, move(5, { target: 1, moveY: 3, duration: 1 })]))).status, 'complete', 'a timed move that clears in time');
  const above = [block(12, 3, 1)];
  assert.equal(finish(createState(level(above))).status, 'complete', 'control: the run passes under it');
  const s = finish(createState(level([...above, move(5, { target: 1, moveY: -3 })])));
  assert.equal(s.status, 'dead');
  near(s.x, 12 - 0.64 + 0.12, 0.05);
});

test('a trigger fires on where the run really is: a wall that holds it short keeps the trigger unfired', () => {
  // a WALL PASS block at 4 holds the run with its x just under 3.5, so the trigger at 3.5 is never
  // reached, even though each step's forward move (before the wall pushes back) passes it
  const held = createState(validateLevel(level([{ ...block(4, 0), wallPass: true }, block(10, 3, 1), move(3.5, { target: 1, moveY: 1 })])));
  let most = 0;
  for (let i = 0; i < 500; i++) {
    step(held, false);
    most = Math.max(most, held.x);
  }
  assert.equal(held.status, 'playing', 'the wall holds the run');
  assert.ok(most < 3.5, `the run never reaches the trigger (got to ${most})`);
  assert.equal(held.fx.fired[2], 0);
  assert.deepEqual(pose(held, 1), [10, 3], 'so its group never moves');
  // control: with no wall the same trigger fires and moves the block
  const free = createState(level([block(10, 3, 1), move(3.5, { target: 1, moveY: 1 })]));
  until(free, 4);
  assert.equal(free.fx.fired[1], 1);
  assert.deepEqual(pose(free, 0), [10, 4]);
});

// one step, one pose: the step that fires an instant move meets the moved pose in its own contact,
// and the pose drawn after it is the pose contact used
const valid = (objects, length) => createState(validateLevel(level(objects, length)));
test('an instant move clears the way in the very step it fires, so the run is never killed by a block drawn out of it', () => {
  // the block's face kills from x 9.48; the trigger at 9.5 is first reached in a step already that close
  assert.equal(finish(valid([block(10, 0, 1)])).status, 'dead', 'control: the block kills where it stands');
  const s = valid([block(10, 0, 1), move(9.5, { target: 1, moveY: 3 })]);
  while (s.status === 'playing' && !s.fx.fired[1]) step(s, false);
  assert.equal(s.status, 'playing', 'the firing step resolved against the moved block');
  assert.deepEqual(pose(s, 0), [10, 3]);
  assert.equal(finish(s).status, 'complete');
});

test('a trigger fired on reach stays fired when the block it moves holds the run back behind it', () => {
  // the run reaches 7.5 and fires; the WALL PASS block it drops in front holds the run at 7.48
  const s = valid([{ ...block(8, 3, 1), wallPass: true }, move(7.5, { target: 1, moveY: -3 })]);
  let fired = -1;
  for (let i = 0; i < 400 && s.status === 'playing'; i++) {
    step(s, false);
    if (fired < 0 && s.fx.fired[1]) fired = i;
  }
  assert.ok(fired >= 0, 'it fired');
  assert.equal(s.status, 'playing', 'held, not killed: the step met the block where it now stands');
  assert.ok(s.x < 7.5, `the run sits behind the fired trigger (x ${s.x})`);
  assert.deepEqual(pose(s, 0), [8, 0]);
});

test('a cascade waits a step: a trigger reached only because a move cleared the way fires on the next step', () => {
  // the wall at 4 holds the run at 3.48, where A fires and lifts it; the redo lets the run on past B
  // (3.49), but B fires one step later, never in the step that lifted the wall
  const s = valid([
    { ...block(4, 0, 1), wallPass: true },
    block(20, 3, 2),
    move(3.48, { target: 1, moveY: 3 }),
    move(3.49, { target: 2, moveY: 1 }),
  ]);
  while (s.status === 'playing' && !s.fx.fired[2]) step(s, false);
  assert.ok(s.x >= 3.49, `the redo carried the run past B (x ${s.x})`);
  assert.equal(s.fx.fired[3], 0, 'B waits');
  assert.deepEqual(pose(s, 1), [20, 3]);
  step(s, false);
  assert.equal(s.fx.fired[3], 1, 'and fires on the next step');
  assert.deepEqual(pose(s, 1), [20, 4]);
});

// The state a step leaves, minus the level: what a second contact pass has to reproduce exactly
const player = (s) => ({ x: s.x, y: s.y, vy: s.vy, grounded: s.grounded, status: s.status, wall: s.wall, speed: s.speed,
  gravity: s.gravity, mode: s.mode, touching: [...s.touchingPortals], coins: s.fx.coins, got: [...s.fx.got] });
// plays a level with no input and returns the step (and x) on which `seen` first holds
function first(objects, seen) {
  const s = valid(objects);
  for (let i = 0; i < 2000 && s.status === 'playing'; i++) {
    step(s, false);
    if (seen(s)) return { step: i, x: s.x };
  }
  throw Error('never happened');
}
const portalTouched = (s) => s.touchingPortals.length > 0,
  coinPicked = (s) => s.fx.coins > 0;
test('a second contact pass starts from the state before the step: portals already inside, entered this step, a coin', () => {
  // a far block moved at once forces the redo; the control's trigger aims at an empty group, so it
  // fires without a redo. every step, both runs leave the same player state.
  const near = [{ ...object('gravity-up', 8, 0) }, object('coin', 8, 0)];
  const touch = first([...near, block(30, 3, 2)], portalTouched).x,
    pick = first([...near, block(30, 3, 2)], coinPicked).x;
  assert.ok(touch < pick, 'the portal is touched before the smaller coin is picked up');
  for (const [name, T] of [['the step it first touches the portal', touch], ['already inside the portal, the step it picks the coin', pick]]) {
    const redo = valid([...near, block(30, 3, 1), move(T, { target: 1, moveY: 1 })]);
    const plain = valid([...near, block(30, 3, 1), move(T, { target: 2, moveY: 1 })]);
    for (let i = 0; i < 400 && redo.status === 'playing'; i++) {
      step(redo, false);
      step(plain, false);
      assert.deepEqual(player(redo), player(plain), `${name}: step ${i}`);
    }
    assert.equal(redo.fx.fired[3], 1, `${name}: the redo trigger fired`);
    assert.deepEqual(pose(redo, 2), [30, 4]);
    assert.equal(plain.gravity, 1, `${name}: the portal really flipped gravity`);
    assert.equal(plain.fx.coins, 1, `${name}: and the coin was really picked up`);
  }
});

test('a portal or a coin moved away in the step that reaches it is not entered or kept', () => {
  // a coin alone, so nothing else is at the spot; the trigger fires on the step pass one picks it up
  const coin = first([object('coin', 8, 0), block(30, 3, 2)], coinPicked);
  const c = valid([{ ...object('coin', 8, 0), group: 1 }, move(coin.x, { target: 1, moveY: 3 })]);
  for (let i = 0; i <= coin.step; i++) step(c, false);
  assert.equal(c.fx.fired[1], 1, 'fired on the step that first picked it up');
  assert.equal(c.fx.coins, 0, 'the coin was moved away before it could be kept');
  assert.equal(c.fx.got[0], 0);
  assert.deepEqual(pose(c, 0), [8, 3]);
  assert.equal(finish(c).fx.coins, 0, 'and the run never meets it again');
  // the same for a gravity portal, on the step pass one first touches it
  const portal = first([object('gravity-up', 8, 0), object('coin', 30, 3)], portalTouched);
  const p = valid([{ ...object('gravity-up', 8, 0), group: 1 }, move(portal.x, { target: 1, moveY: 3 })]);
  for (let i = 0; i <= portal.step; i++) step(p, false);
  assert.equal(p.fx.fired[1], 1, 'fired on the step that first touched it');
  assert.equal(p.gravity, -1, 'the portal was moved away before it could be entered');
  assert.deepEqual(p.touchingPortals, []);
  assert.deepEqual(pose(p, 0), [8, 3]);
});

test('restart, death and leaving put every moved piece, colour and coin back; the authored level is untouched', () => {
  const l = level([block(12, 3, 1), move(5, { target: 1, moveY: 2 }), paint(6, { target: 1 }), object('coin', 8, 0), object('spike', 20, 0)]);
  const authored = structuredClone(l);
  const run = new Run(l);
  run.readyTime = 0;
  let restarted = false;
  for (let i = 0; i < 4000 && !restarted; i++) {
    restarted = run.advance(STEP).restarted;
    if (!restarted && run.state.x > 9) {
      assert.deepEqual(pose(run.state, 0), [12, 5]);
      assert.ok(tintOf(run.state.fx, 0, run.state.time));
      assert.equal(run.state.fx.coins, 1);
    }
  }
  assert.ok(restarted, 'the spike killed the run and it started over');
  assert.equal(run.attempt, 2);
  assert.deepEqual(pose(run.state, 0), [12, 3]);
  assert.equal(tintOf(run.state.fx, 0, run.state.time), null);
  assert.equal(run.state.fx.coins, 0);
  assert.deepEqual([...run.state.fx.fired], [0, 0, 0, 0, 0]);
  assert.deepEqual(run.level, authored);
  assert.deepEqual(l, authored);
  // RESTART LEVEL from pause is run.reset(); the same fresh start
  for (let i = 0; i < 400; i++) run.advance(STEP);
  run.reset();
  assert.deepEqual(run.state, createState(authored));
  // a validated save of the level is unchanged after a run too
  const save = readSave(null, 23);
  storeDraft(save, l);
  const saved = JSON.stringify(save);
  finish(new Run(save.draft).state);
  assert.equal(JSON.stringify(save), saved);
});

test('overlap: a new move starts from where the piece is and replaces the one it had', () => {
  const l = level([block(12, 3, 1), move(5, { target: 1, moveX: 4, duration: 2 }), move(6, { target: 1, moveY: 2 })]);
  const s = until(createState(l), 5);
  let at;
  while (!s.fx.fired[2]) {
    at = pose(s, 0);
    step(s, false);
  }
  const x = pose(s, 0)[0];
  assert.ok(x > 12.3 && x < 12.5, `part way along the first move (${x})`);
  assert.ok(x > at[0], 'the first move ran up to this step');
  for (let i = 0; i < 600; i++) step(s, false);
  assert.deepEqual(pose(s, 0), [x, 5], 'the first move stopped where the second found it');
});

test('ties: triggers crossed in one step all fire, in authored order', () => {
  const tie = (first, second) => pose(until(createState(level([block(12, 3, 1), first, second])), 5), 0);
  const slow = move(5, { target: 1, moveY: 2, duration: 1 }),
    drop = { ...move(5, { target: 1, moveY: -1 }), y: 1 };
  assert.deepEqual(tie(slow, drop), [12, 2], 'the drop replaces the slow rise before it moves at all');
  const s = until(createState(level([block(12, 3, 1), drop, slow])), 5);
  for (let i = 0; i < 240; i++) step(s, false);
  assert.deepEqual(pose(s, 0), [12, 4], 'the other order: drop, then rise from there');
  // one long step past three triggers fires all three, wherever they are
  const many = createState(level([block(20, 3, 1), block(22, 3, 2), block(24, 3, 3),
    move(3.5, { target: 1, moveY: 1 }), move(4.5, { target: 2, moveY: 1 }), move(5.5, { target: 3, moveY: 1 })]));
  step(many, false, 1);
  assert.ok(many.x >= 5.5);
  assert.deepEqual([pose(many, 0), pose(many, 1), pose(many, 2)], [[20, 4], [22, 4], [24, 4]]);
});

test('pause freezes moves and fades: they follow the run clock, so a paused run picks up where it stopped', () => {
  const l = level([block(12, 3, 1), move(5, { target: 1, moveX: 3, duration: 2 }), paint(5, { target: 1, color: '#53e3ff', duration: 2 })], 60);
  const straight = new Run(l),
    paused = new Run(l);
  straight.readyTime = paused.readyTime = 0;
  for (let i = 0; i < 240; i++) straight.advance(STEP);
  for (let i = 0; i < 150; i++) paused.advance(STEP);
  const mid = structuredClone(paused.state);
  assert.ok(paused.state.fx.movers.length, 'mid move');
  paused.interrupt(); // what pause does; frames stop calling advance until resume
  assert.deepEqual(paused.state, mid, 'nothing moves while paused');
  assert.deepEqual(tintOf(paused.state.fx, 0, paused.state.time), tintOf(mid.fx, 0, mid.time));
  for (let i = 0; i < 90; i++) paused.advance(STEP);
  assert.deepEqual(paused.state, straight.state);
});

test('colour trigger: its group only, instant or faded, and a new colour fades from what shows', () => {
  const s = until(createState(level([block(12, 3, 2), block(14, 3, 3), block(16, 3), paint(5, { target: 2, color: '#ff5c7a' })])), 5);
  assert.deepEqual([...tintOf(s.fx, 0, s.time)], [255, 92, 122, 1]);
  assert.equal(tintOf(s.fx, 1, s.time), null, 'another group is untouched');
  assert.equal(tintOf(s.fx, 2, s.time), null, 'and so is a piece with no group');
  const fade = until(createState(level([block(12, 3, 2), paint(5, { target: 2, color: '#53e3ff', duration: 2 }), paint(10, { target: 2, color: '#ff5c7a', duration: 2 })])), 5);
  const start = fade.time;
  for (let i = 0; i < 120; i++) step(fade, false);
  const half = tintOf(fade.fx, 0, fade.time);
  near(half[3], (fade.time - start) / 2, 1e-9);
  assert.deepEqual([...half.slice(0, 3)], [0x53, 0xe3, 0xff], 'fading in from the piece itself');
  until(fade, 10);
  const from = [...tintOf(fade.fx, 0, fade.time)];
  near(from[3], (fade.time - start) / 2, 1e-9);
  const second = fade.time;
  for (let i = 0; i < 120; i++) step(fade, false);
  const p = (fade.time - second) / 2,
    mix = tintOf(fade.fx, 0, fade.time),
    a = from[3] + (1 - from[3]) * p;
  near(mix[3], a, 1e-9);
  near(mix[0], (0x53 * from[3] * (1 - p) + 0xff * p) / a, 1e-9);
  for (let i = 0; i < 200; i++) step(fade, false);
  assert.deepEqual([...tintOf(fade.fx, 0, fade.time)], [255, 92, 122, 1]);
});

// the migration test's command recorder, also returning the view
Object.assign(globalThis, { innerWidth: 932, innerHeight: 430, devicePixelRatio: 2 });
function draw(options) {
  const log = [];
  const ctx = new Proxy({}, {
    set(target, key, value) { target[key] = value; log.push(['set', key, value]); return true; },
    get(target, key) {
      if (key in target) return target[key];
      return (...args) => { log.push([key, ...args]); if (key === 'createLinearGradient') return { addColorStop() {} }; };
    },
  });
  const view = render({ width: 1864, height: 860, getContext: () => ctx }, options);
  return { log: JSON.parse(JSON.stringify(log)), view };
}

test('drawing uses the same moved pose and colour as collision, even for a piece moved in from off screen', () => {
  const l = level([block(50, 3, 1), move(4, { target: 1, moveX: -40 }), paint(4, { target: 1, color: '#ff5c7a' })], 60);
  const s = createState(l);
  const before = draw({ state: s, level: s.level, camera: 0 });
  const at = (log, view, x, y) => log.some(([cmd, a, b]) => cmd === 'moveTo' && Math.abs(a - (x - view.camera) * view.unit) < 1e-6 && Math.abs(b - (view.floor - (y - view.cameraY) * view.unit)) < 1e-6);
  assert.equal(at(before.log, before.view, 50, 3), false, 'off screen before the trigger');
  until(s, 4);
  const camera = Math.max(0, s.x - 3),
    after = draw({ state: s, level: s.level, camera });
  const [x, y] = polygon(s.level.objects[0])[0];
  assert.deepEqual([x, y], [10, 3]);
  assert.ok(at(after.log, after.view, x, y), 'painted at the pose collision uses');
  assert.ok(after.log.some(([cmd, key, value]) => cmd === 'set' && key === 'fillStyle' && value === 'rgba(255,92,122,1)'), 'in its trigger colour');
  assert.equal(before.log.some(([cmd, key, value]) => cmd === 'set' && key === 'fillStyle' && String(value).startsWith('rgba(')), false);
  // in play a trigger and a picked-up coin are not painted; the editor shows triggers
  const words = (log) => log.filter(([cmd]) => cmd === 'fillText').map(([, t]) => t);
  assert.equal(words(after.log).includes('MOVE'), false);
  const edit = draw({ state: null, level: { ...l, objects: [...l.objects, block(8, 2, 4)] }, editing: true });
  assert.ok(words(edit.log).includes('MOVE') && words(edit.log).includes('COLOR'), 'what each trigger does');
  assert.ok(words(edit.log).includes('G 1'), 'the group a trigger works on');
  assert.ok(words(edit.log).includes('G4'), 'and a grouped piece is marked with its id');
});

// A recorded run: the held input at each fixed step. Replays feed it back through the shipped Run.
const busy = level([
  block(9, 0, 1), move(5, { target: 1, moveY: 3, duration: 0.4 }),
  block(16, 3, 2), block(17, 3, 2), move(12, { target: 2, moveY: -3, moveX: 2, duration: 1 }),
  paint(8, { target: 1, color: '#9aff6b', duration: 1 }), paint(14, { target: 2, color: '#2b4cff' }),
  object('coin', 7, 0), object('coin', 13, 1), object('coin', 22, 2), object('spike', 28, 0), block(34, 0, 3), move(30, { target: 3, moveY: 2 }),
], 60);
function record(seed) {
  const run = new Run(busy),
    held = [],
    states = [];
  run.readyTime = 0;
  for (let i = 0; i < 2400 && run.attempt === 1; i++) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const press = seed % 7 === 0;
    held.push(press);
    if (press) run.press();
    else run.release();
    run.advance(STEP);
    states.push(structuredClone(run.state));
  }
  return { held, states };
}
function replay(held, run = new Run(busy)) {
  run.readyTime = 0;
  return held.map((press) => {
    if (press) run.press();
    else run.release();
    run.advance(STEP);
    return structuredClone(run.state);
  });
}

test('a recorded run of a triggered level replays identically, frame by frame, after a restart too', () => {
  const { held, states } = record(713);
  assert.ok(states.length > 300, `${states.length} frames`);
  const fired = Math.max(...states.map((s) => s.fx.fired.reduce((a, b) => a + b, 0)));
  assert.ok(fired >= 4, `${fired} triggers fired in the recording`);
  assert.deepEqual(replay(held), states);
  // the same input after a mid-run restart gives the same frames as a fresh run
  const run = new Run(busy);
  replay(held.slice(0, 200), run);
  run.reset();
  assert.deepEqual(replay(held, run), states);
});

test('a triggered level runs the same at any render cadence', () => {
  const finals = [30, 60, 120].map((hz) => {
    const run = new Run(busy);
    run.readyTime = 0;
    for (let i = 0; i < hz * 3; i++) run.advance(1 / hz);
    return run.state;
  });
  assert.ok(finals[0].fx.fired.some(Boolean));
  assert.deepEqual(finals[0], finals[1]);
  assert.deepEqual(finals[1], finals[2]);
});
