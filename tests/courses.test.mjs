import test from "node:test";
import assert from "node:assert/strict";
import { COURSES } from "../src/courses.ts";
import { REMIX } from "../src/remix.ts";
import {
  LEVELS,
  COLLECTIONS,
  COURSE_ORDER,
  courseSong,
} from "../src/levels.ts";
import { Run } from "../src/run.ts";
import {
  createState,
  step,
  STEP,
  validateLevel,
  MAX_LENGTH,
} from "../src/engine.ts";
import { RECORDINGS, recordingFor } from "../src/recordings.ts";
import { courseInput } from "./course-input.mjs";
import { REMIX_INPUTS } from "./remix-inputs.mjs";
import {
  appendLevel,
  encodeLevel,
  decodeLevel,
  importLevel,
} from "../src/transfer.ts";
import { readSave, SAVE } from "../src/library.ts";

for (const level of COURSES)
  test(`human-rate completion witness: ${level.name}`, () => {
    assert.deepEqual(validateLevel(level), level);
    const run = new Run(level);
    let held = false,
      presses = 0,
      lastPress = -Infinity;
    for (let tick = 0; tick < 12000 && run.state.status === "playing"; tick++) {
      if (tick % 6 === 0 && run.readyTime <= 0) {
        const next = courseInput(run.state);
        if (next && !held) {
          assert.ok(
            tick - lastPress >= 12,
            "never require taps closer than 100 ms",
          );
          run.press();
          presses++;
          lastPress = tick;
        } else if (!next && held) run.release();
        held = next;
      }
      run.advance(STEP);
    }
    assert.equal(
      run.state.status,
      "complete",
      `${level.name}: x=${run.state.x}, y=${run.state.y}`,
    );
    assert.equal(run.attempt, 1);
    assert.ok(presses >= 10 && presses <= 110, `${presses} presses`);
    assert.ok(run.state.time >= 47 && run.state.time <= 72);
    const noInput = createState(level);
    for (let i = 0; i < 12000 && noInput.status === "playing"; i++)
      step(noInput, false);
    assert.equal(noInput.status, "dead", "a completion is not an empty course");
  });

// The Remix trails (#71) play shapes and pieces courseInput does not (the angle, rings, speed
// portals, zones), so each one replays its own input timeline: the 50 ms samples at which the
// held input flips (tests/remix-inputs.mjs, written by scripts/remix-witness.mjs). The rules are
// the ones above: input only, a decision every 50 ms, presses 100 ms apart, the first try.
for (const level of REMIX)
  test(`human-rate completion witness: ${level.name}`, () => {
    assert.deepEqual(validateLevel(level), level);
    const flips = REMIX_INPUTS[level.name];
    assert.ok(flips?.length, "every Remix trail has an input timeline");
    const run = new Run(level);
    let held = false,
      presses = 0,
      lastPress = -Infinity,
      sample = 0,
      next = 0;
    for (let tick = 0; tick < 12000 && run.state.status === "playing"; tick++) {
      if (tick % 6 === 0 && run.readyTime <= 0) {
        if (flips[next] === sample) {
          next++;
          held = !held;
          if (held) {
            assert.ok(
              tick - lastPress >= 12,
              "never require taps closer than 100 ms",
            );
            run.press();
            presses++;
            lastPress = tick;
          } else run.release();
        }
        sample++;
      }
      run.advance(STEP);
    }
    assert.equal(
      run.state.status,
      "complete",
      `${level.name}: x=${run.state.x}, y=${run.state.y}`,
    );
    assert.equal(next, flips.length, "the whole timeline was played");
    assert.equal(run.attempt, 1);
    assert.ok(presses >= 20 && presses <= 110, `${presses} presses`);
    assert.ok(run.state.time >= 47 && run.state.time <= 80);
    // Not trivially passable: holding nothing dies, and so does holding from the first sample.
    const noInput = createState(level);
    for (let i = 0; i < 12000 && noInput.status === "playing"; i++)
      step(noInput, false);
    assert.equal(noInput.status, "dead", "a completion is not an empty course");
    const holding = new Run(level);
    for (let tick = 0; tick < 12000 && holding.state.status === "playing"; tick++) {
      if (tick % 6 === 0 && holding.readyTime <= 0 && !holding.held)
        holding.press();
      holding.advance(STEP);
    }
    assert.equal(holding.state.status, "dead", "nor is holding all the way");
  });

test("groups preserve all old identities and show increasing course lengths", () => {
  assert.equal(LEVELS.length, 23);
  assert.deepEqual(
    LEVELS.slice(0, 9).map((l) => l.name),
    [
      "First Spark",
      "Step It Up",
      "Air Time",
      "Double Take",
      "Sky Circuit",
      "Switchcraft",
      "Clone Dash",
      "Gravity Flip",
      "Air Steps",
    ],
  );
  assert.equal(new Set(COURSE_ORDER).size, LEVELS.length);
  assert.deepEqual(
    COURSE_ORDER.toSorted((a, b) => a - b),
    LEVELS.map((_, i) => i),
  );
  assert.deepEqual(
    COLLECTIONS.slice(0, 3).map((g) => g.indices.map((i) => LEVELS[i].length)),
    [
      [240, 240, 240],
      [300, 300, 300],
      [360, 360, 360],
    ],
  );
  assert.deepEqual(
    COURSES.map((l) => l.song),
    RECORDINGS.map((r) => r.id),
  );
  assert.deepEqual(
    LEVELS.slice(0, 9).map((_, i) => courseSong(i)),
    [0, 1, 2, 3, 4, 5, 6, 7, 8],
  );
  // The Remix set comes after every older trail, so saved bests keep their indices.
  assert.deepEqual(LEVELS.slice(18), REMIX);
  assert.deepEqual(
    COLLECTIONS.find((g) => g.name === "Remix").indices,
    [18, 19, 20, 21, 22],
  );
  // and each declares one of the licensed recordings, as the courses do
  assert.ok(
    REMIX.every((l, i) => courseSong(18 + i) === l.song && recordingFor(l.song)),
  );
});

test("every course can be independently copied, encoded and decoded with its own song", async () => {
  for (let i = 0; i < LEVELS.length; i++) {
    const original = structuredClone(LEVELS[i]);
    const copy = { ...LEVELS[i], song: courseSong(i) };
    const appended = appendLevel(readSave(null, LEVELS.length), copy);
    const decoded = await decodeLevel(
      await encodeLevel(appended.customLevels.at(-1).level),
    );
    assert.deepEqual(decoded, copy);
    appended.customLevels.at(-1).level.objects[0].x++;
    assert.deepEqual(LEVELS[i], original);
  }
});

test("copy re-reads the latest library and selects the new entry in one verified write", () => {
  const stale = readSave(null, 18);
  const latest = appendLevel(stale, COURSES[0]);
  latest.best[0] = 100;
  let raw = JSON.stringify(latest),
    writes = 0;
  const storage = {
    getItem: () => raw,
    setItem: (key, value) => {
      assert.equal(key, SAVE);
      raw = value;
      writes++;
    },
  };
  const next = importLevel(storage, stale, COURSES[1], 18, true);
  assert.equal(writes, 1);
  assert.equal(next.activeLevel, 3);
  assert.deepEqual(next.draft, COURSES[1]);
  assert.deepEqual(next.customLevels.slice(0, 2), latest.customLevels);
  assert.equal(next.best[0], 100);
  assert.deepEqual(readSave(raw, 18), next);
  assert.throws(
    () =>
      importLevel(
        { getItem: () => JSON.stringify(latest), setItem: () => {} },
        stale,
        COURSES[1],
        18,
        true,
      ),
    /confirm/,
  );
});

test("long editor levels remain bounded and unknown soundtrack IDs are refused", () => {
  const base = { ...COURSES[0], length: MAX_LENGTH };
  assert.equal(validateLevel(base).length, 600);
  assert.throws(() => validateLevel({ ...base, length: 601 }));
  assert.throws(() => validateLevel({ ...base, song: 118 }));
  assert.equal(validateLevel({ ...base, song: 108 }).song, 108);
});
