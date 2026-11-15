import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, writeFile, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { LEVELS } from '../src/levels.ts';
import { Run } from '../src/run.ts';
import { STEP, object } from '../src/engine.ts';
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
