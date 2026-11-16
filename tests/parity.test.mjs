import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, writeFile, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { LEVELS } from '../src/levels.ts';
import { Run } from '../src/run.ts';
import { STEP, SIZE, BLOCKS, SLOPES, PORTALS, object, polygon, intersects } from '../src/engine.ts';
import { encodeLevel, decodeLevel } from '../src/transfer.ts';
import { readSave } from '../src/library.ts';
import { REMIX_INPUTS } from './remix-inputs.mjs';

// Coins and triggers (#101) must leave every level without them exactly as main played it. MAIN is
// the commit they were built on; its src is loaded from git next to today's, like the frozen tree
// in migration.test.mjs, and the two are run side by side on the same input.
const MAIN = 'bdf5958';
const FIXTURE = JSON.parse(await readFile(new URL('./fixtures/main-bdf5958.json', import.meta.url), 'utf8'));

async function withMain(check) {
  const dir = await mkdtemp(join(tmpdir(), 'clonedash-main-'));
  try {
    const files = execFileSync('git', ['ls-tree', '--name-only', `${MAIN}:src`], { encoding: 'utf8' }).split('\n').filter((f) => f.endsWith('.ts'));
    for (const file of files)
      await writeFile(join(dir, file), execFileSync('git', ['show', `${MAIN}:src/${file}`], { encoding: 'utf8' }));
    const load = (name) => import(pathToFileURL(join(dir, name)).href);
    await check({ run: await load('run.ts'), levels: await load('levels.ts'), transfer: await load('transfer.ts'), library: await load('library.ts') });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
const frame = (s) => [s.x, s.y, s.vy, s.mode, s.gravity, s.speed, s.wall, s.dash, s.grounded, s.status, s.time, s.touchingPortals.join(), s.usedRings.join()];

test('a level without coins or triggers plays exactly as on main, frame by frame, through deaths and restarts', async () => {
  await withMain(async (main) => {
    assert.deepEqual(LEVELS, main.levels.LEVELS, 'every built-in course is unchanged');
    let frames = 0,
      restarts = 0;
    for (const level of LEVELS)
      for (const seed of [713, 4242]) {
        const a = new main.run.Run(level),
          b = new Run(level);
        let s = seed;
        for (let i = 0; i < 6000; i++) {
          s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
          for (const run of [a, b]) {
            if (s % 9 < 3) run.press();
            else run.release();
          }
          const ea = a.advance(STEP),
            eb = b.advance(STEP);
          assert.deepEqual(eb, ea);
          assert.deepEqual(frame(b.state), frame(a.state), `${level.name}/${seed}/frame${i}`);
          if (eb.restarted) restarts++;
          frames++;
          if (a.state.status === 'complete') break;
        }
        assert.deepEqual(b.state, a.state, `${level.name}/${seed}`);
        assert.equal('fx' in b.state, false);
      }
    assert.ok(frames > 100000, `${frames} frames`);
    assert.ok(restarts > 20, `${restarts} restarts compared`);
  });
});

test('each Remix witness recording replays to the same frames on main and today', async () => {
  await withMain(async (main) => {
    for (const level of main.levels.LEVELS.filter((l) => REMIX_INPUTS[l.name])) {
      const flips = REMIX_INPUTS[level.name],
        runs = [new main.run.Run(level), new Run(level)];
      for (const run of runs) {
        let held = false,
          sample = 0,
          next = 0;
        const trail = [];
        for (let tick = 0; tick < 12000 && run.state.status === 'playing'; tick++) {
          if (tick % 6 === 0 && run.readyTime <= 0) {
            if (flips[next] === sample) {
              next++;
              held = !held;
              if (held) run.press();
              else run.release();
            }
            sample++;
          }
          run.advance(STEP);
          trail.push(frame(run.state));
        }
        run.trail = trail;
      }
      assert.equal(runs[1].state.status, 'complete', level.name);
      assert.deepEqual(runs[1].trail, runs[0].trail, level.name);
      assert.deepEqual(runs[1].state, runs[0].state, level.name);
    }
  });
});

// The angle now dies on solid contact (#106, docs/ramps-and-boosters.md). Four Remix witnesses rode
// block faces in their angle sections; no geometry changed, only those timelines were re-recorded
// from their angle portal on (scripts/remix-witness.mjs "<trail>@<x>"), and the test above holds
// every new timeline to main frame for frame. This is the old control: each old timeline still
// finishes on main, today's frames match it until that section, where they part in angle mode (main
// lands on a face) and today dies there against a solid. Every flip before the section was kept.
const RERECORDED = { 'Shapeshifter': 240, 'Quick Change': 156, 'Block Party': 126, 'Grand Finale': 182 };
test('the old witnesses of the re-recorded angle sections finish on main and die on solid contact today', async () => {
  const old = await import(`data:text/javascript,${encodeURIComponent(execFileSync('git', ['show', `${MAIN}:tests/remix-inputs.mjs`], { encoding: 'utf8' }))}`);
  for (const name of Object.keys(REMIX_INPUTS))
    if (!(name in RERECORDED)) assert.deepEqual(REMIX_INPUTS[name], old.REMIX_INPUTS[name], `${name} was not re-recorded`);
  await withMain(async (main) => {
    for (const [name, from] of Object.entries(RERECORDED)) {
      const level = LEVELS.find((l) => l.name === name),
        flips = old.REMIX_INPUTS[name],
        runs = [new main.run.Run(level), new Run(level)],
        input = runs.map(() => ({ held: false, sample: 0, next: 0, firstAt: null }));
      let death = null,
        parted = null;
      for (let tick = 0; tick < 12000 && runs[0].state.status === 'playing'; tick++) {
        runs.forEach((run, k) => {
          const t = input[k];
          if (run.state.status !== 'playing') return;
          if (tick % 6 === 0 && run.readyTime <= 0) {
            if (t.firstAt === null && run.state.x >= from) t.firstAt = t.sample;
            if (flips[t.next] === t.sample) {
              t.next++;
              t.held = !t.held;
              if (t.held) run.press();
              else run.release();
            }
            t.sample++;
          }
          run.advance(STEP);
        });
        const [a, b] = runs.map((r) => r.state);
        if (death) continue;
        if (!parted && JSON.stringify(frame(b)) !== JSON.stringify(frame(a))) parted = { x: b.x, mode: b.mode, main: a.status };
        if (b.status === 'dead')
          death = { x: b.x, mode: b.mode, touch: b.level.objects.some((o) => (BLOCKS.includes(o.type) || SLOPES.includes(o.type)) && o.layer !== 'background' && !o.noTouch && intersects([[b.x, b.y], [b.x + SIZE, b.y], [b.x + SIZE, b.y + SIZE], [b.x, b.y + SIZE]], polygon(o))) };
      }
      assert.equal(runs[0].state.status, 'complete', `${name}: the old timeline finishes on main`);
      assert.ok(death, `${name}: and dies today`);
      const angle = level.objects.find((o) => o.type === 'angle' && o.x >= from).x,
        next = Math.min(...level.objects.filter((o) => PORTALS.includes(o.type) && o.x > angle && o.type !== 'angle').map((o) => o.x));
      for (const [what, at] of [['part', parted], ['die', death]]) {
        assert.equal(at.mode, 'angle', `${name}: ${what}s in angle mode`);
        assert.ok(at.x > angle && at.x < next, `${name}: ${what}s inside its angle section (${angle} to ${next}), at ${at.x}`);
      }
      assert.equal(parted.main, 'playing');
      assert.ok(death.touch, `${name}: against a solid`);
      assert.ok(death.x - parted.x < 1, `${name}: within a block of where it parted from main`);
      const kept = flips.filter((f) => f < input[1].firstAt);
      assert.ok(kept.length > 10);
      assert.deepEqual(REMIX_INPUTS[name].slice(0, kept.length), kept, `${name}: every flip before the section is kept`);
      assert.ok(REMIX_INPUTS[name][kept.length] >= input[1].firstAt);
    }
  });
});

// the compressed bytes of a code depend on the zlib build (node 22 on ci and node 26 locally differ),
// so a re-encode is held to main's encoder on the same runtime, and to what both decoders get out of it,
// never to bytes captured on another machine
test('old share codes captured on main decode exactly as main decoded them, and old levels encode as main encodes them', async () => {
  await withMain(async (main) => {
    for (const [name, { code, decoded }] of Object.entries(FIXTURE.codes)) {
      assert.deepEqual(await decodeLevel(code), decoded, name);
      const again = await encodeLevel(decoded);
      assert.equal(again, await main.transfer.encodeLevel(decoded), `${name}: the same code main makes here`);
      assert.equal(again.slice(0, 6), code.slice(0, 6), `${name}: the cdl1 envelope is unchanged`);
      assert.deepEqual(await decodeLevel(again), decoded, `${name}: this version reads its own code back`);
      assert.deepEqual(await main.transfer.decodeLevel(again), decoded, `${name}: and main reads it the same`);
    }
    // the other way: main refuses a level with a coin rather than dropping it silently
    const coin = await encodeLevel({ name: 'New', length: 40, objects: [object('coin', 6, 0)] });
    await assert.rejects(() => main.transfer.decodeLevel(coin));
  });
});

test('old saves captured on main read back exactly as main read them', () => {
  for (const [name, { raw, result }] of Object.entries(FIXTURE.saves)) {
    let read;
    assert.doesNotThrow(() => (read = readSave(raw, LEVELS.length)), name);
    assert.deepEqual(read, result, name);
    assert.equal('coins' in read, false);
    assert.ok(read.customLevels.every((entry) => !('coins' in entry)));
  }
});
