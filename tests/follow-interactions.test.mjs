import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createState, object, step, validateLevel } from '../src/engine.ts';
import { readSave, storeDraft } from '../src/library.ts';
import { encodeLevel } from '../src/transfer.ts';

const piece = (type, x, y, fields = {}) => ({ ...object(type, x, y), ...fields });
const marker = (x, y, group) => piece('block', x, y, { group, noTouch: true });
const follow = (x, target, leader, axis) => piece('follow-trigger', x, 0, { target, leader, axis });
const move = (x, target, moveX, moveY, duration) => piece('move-trigger', x, 0, { target, moveX, moveY, duration });
const trail = objects => validateLevel({ name: 'Follow interactions', length: 60, height: 12, song: 9, objects });
const until = (s, x) => {
  for (let n = 0; n < 1800 && s.x < x && s.status === 'playing'; n++) step(s, false);
  return s;
};
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-9, actual + ' != ' + expected);

test('a followed spike drops into the player on the instant its source moves; no follow is safe', () => {
  const objects = [marker(14, 5, 1), piece('spike', 8, 4, { group: 2 }), follow(3, 2, 1), move(8, 1, 0, -4, 0)];
  const s = until(createState(trail(objects)), 8);
  near(s.level.objects[0].y, 1);
  near(s.level.objects[1].y, 0);
  assert.equal(s.status, 'dead', 'contact re-read the moved spike in the firing step');
  assert.equal(until(createState(trail(objects.filter(o => o.type !== 'follow-trigger'))), 60).status, 'complete');
});

test('a timed move of a follower adds to follow motion throughout, including after it finishes', () => {
  const s = createState(trail([marker(14, 4, 1), marker(17, 4, 2), follow(3, 2, 1), move(4, 1, 4, 0, 2), move(4, 2, 2, 1, 1)]));
  until(s, 4);
  const start = s.time;
  for (let i = 0; i < 300; i++) {
    step(s, false);
    const t = s.time - start;
    const [source, follower] = s.level.objects;
    near(source.x, 14 + 2 * Math.min(2, t));
    near(follower.x, source.x + 3 + 2 * Math.min(1, t));
    near(follower.y, 4 + Math.min(1, t));
  }
});

test('a later follow rebinds at the current offset, stops the old one and applies the new axis', () => {
  const s = createState(trail([marker(17, 1, 1), marker(18, 4, 2), marker(20, 2, 3),
    follow(3, 1, 2), move(4, 2, 4, 4, 4), move(4, 3, -4, 4, 4), follow(7, 1, 3, 'x')]));
  until(s, 7);
  const [follower, oldLeader, newLeader] = s.level.objects;
  const at = { x: follower.x, y: follower.y, newX: newLeader.x, oldX: oldLeader.x };
  assert.ok(at.x > 17 && at.y > 1, 'the first binding moved on both axes');
  until(s, 15);
  assert.ok(oldLeader.x > at.oldX && newLeader.x < at.newX);
  near(follower.x, at.x + newLeader.x - at.newX);
  near(follower.y, at.y);
});

test('a saved follow trail keeps its fields; the previous production reader rejects its code rather than dropping follow', async () => {
  const l = trail([marker(11, 2, 1), marker(15, 3, 2), follow(4, 1, 2, 'y')]);
  const save = readSave(null, 23);
  storeDraft(save, l);
  assert.deepEqual(readSave(JSON.stringify(save), 23).activeLevel, save.activeLevel);
  assert.deepEqual(readSave(JSON.stringify(save), 23).draft.objects, l.objects);
  const dir = await mkdtemp(join(tmpdir(), 'clonedash-before-follow-'));
  try {
    const ref = 'aa7360461d3267a6f711d9418120b4cfcb29145c';
    const archive = execFileSync('git', ['archive', ref, 'src']);
    execFileSync('tar', ['-xf', '-', '-C', dir], { input: archive });
    const old = await import(join(dir, 'src/transfer.ts'));
    const control = trail(l.objects.filter(o => o.type !== 'follow-trigger'));
    assert.equal(await old.encodeLevel(control), await encodeLevel(control));
    await assert.rejects(old.decodeLevel(await encodeLevel(l)), /invalid object/i);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
