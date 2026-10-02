import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import * as engine from "../src/engine.ts";
import { LEVELS } from "../src/levels.ts";
import { readSave } from "../src/library.ts";
import { trackFor } from "../src/music.ts";
import { Run } from "../src/run.ts";
import { render } from "../src/render.ts";

const BASELINE = "c00928c1c005aad711b752690881b9b5f332a089";
// 2026-09-29: the stored id "jumper" became "pogo" (#33). The frozen tree still speaks the old
// id, so the legacy side is relabelled at its boundary only: levels going INTO the old modules
// get the old id back, and states, levels and painted words coming OUT get the new one. Every
// comparison below is still whole-value deepEqual; nothing is skipped or loosened.
const LEGACY_IDS = { jumper: "pogo" };
const modernId = (id) => LEGACY_IDS[id] ?? id;
const legacyId = (id) =>
  Object.keys(LEGACY_IDS).find((old) => LEGACY_IDS[old] === id) ?? id;
const relabelLevel = (level, map) => ({
  ...level,
  objects: level.objects.map((o) => ({ ...o, type: map(o.type) })),
});
const legacyLevel = (level) => relabelLevel(level, legacyId);
const modernLevel = (level) => relabelLevel(level, modernId);
// 2026-09-30: speed portals (#58) added a speed field to the state. The frozen tree has no speed
// portals, so every state it produces runs at 1x; it gets that field at the same boundary. A W
// holding the run at a wall (#69) is never true there either, so wall is null.
const modernState = (state) => ({
  ...state,
  speed: 1,
  wall: null,
  mode: modernId(state.mode),
  level: modernLevel(state.level),
});
export async function withLegacy(check) {
  const dir = await mkdtemp(join(tmpdir(), "clonedash-baseline-"));
  try {
    for (const name of ["engine", "levels", "library", "music", "render"]) {
      const source = execFileSync(
        "git",
        ["show", `${BASELINE}:public/${name}.js`],
        { encoding: "utf8" },
      );
      await writeFile(
        join(dir, `${name}.mjs`),
        source.replaceAll("./engine.js", "./engine.mjs"),
      );
    }
    const modules = await Promise.all(
      ["engine", "levels", "library", "music", "render"].map(
        (name) => import(pathToFileURL(join(dir, `${name}.mjs`)).href),
      ),
    );
    await check(...modules);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

test("typed engine matches the pinned pre-migration tree frame by frame", async () => {
  await withLegacy((old, levels) => {
    assert.deepEqual(
      LEVELS.slice(0, levels.LEVELS.length),
      levels.LEVELS.map(modernLevel),
    );
    let frames = 0;
    for (const level of LEVELS)
      for (const mode of ["square", "plane", "wheel", "pogo"])
        for (const gravity of [-1, 1]) {
          const a = old.createState(legacyLevel(structuredClone(level))),
            b = engine.createState(structuredClone(level));
          a.mode = legacyId(mode);
          b.mode = mode;
          a.gravity = b.gravity = gravity;
          let seed = 713;
          for (let i = 0; i < 2400; i++) {
            seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
            const held = i % 17 < 8,
              tap = seed % 11 === 0;
            old.step(a, held, old.STEP, tap);
            engine.step(b, held, engine.STEP, tap);
            assert.deepEqual(
              b,
              modernState(a),
              `${level.name}/${mode}/${gravity}/frame${i}`,
            );
            frames++;
            if (a.status !== "playing") break;
          }
        }
    assert(frames > 5000, `only ${frames} frames compared`);
  });
});

test("drawing commands match the original for editor, all modes, gravity and death", async () => {
  await withLegacy((_, __, ___, ____, legacy) => {
    Object.assign(globalThis, {
      innerWidth: 932,
      innerHeight: 430,
      devicePixelRatio: 2,
    });
    function commands(draw, options) {
      const log = [],
        values = {};
      const ctx = new Proxy(values, {
        set(target, key, value) {
          target[key] = value;
          log.push(["set", key, value]);
          return true;
        },
        get(target, key) {
          if (key in target) return target[key];
          return (...args) => {
            log.push([key, ...args]);
            if (key === "createLinearGradient")
              return {
                addColorStop(...stop) {
                  log.push(["stop", ...stop]);
                },
              };
          };
        },
      });
      draw({ width: 1864, height: 860, getContext: () => ctx }, options);
      // Gradient functions are instruments, not painted values.
      return JSON.parse(JSON.stringify(log));
    }
    // The frozen tree paints a portal's word from its id, so the renamed id (LEGACY_IDS above)
    // is the one painted word that differs. Everything else must match verbatim.
    const PAINTED = Object.fromEntries(
      Object.entries(LEGACY_IDS).map(([old, now]) => [
        old.toUpperCase(),
        now.toUpperCase(),
      ]),
    );
    const relabel = (log) =>
      log.map((cmd) =>
        cmd[0] === "fillText" && cmd[1] in PAINTED
          ? [cmd[0], PAINTED[cmd[1]], ...cmd.slice(2)]
          : cmd,
      );
    // The legacy renderer gets the legacy level and mode; the typed one gets today's.
    const legacyOptions = (options) => ({
      ...options,
      level: legacyLevel(options.level),
      ...(options.state && {
        state: {
          ...options.state,
          mode: legacyId(options.state.mode),
          level: legacyLevel(options.state.level),
        },
      }),
    });
    for (const level of LEVELS)
      for (const mode of ["square", "plane", "wheel", "pogo"])
        for (const gravity of [-1, 1]) {
          const state = {
            ...engine.createState(level),
            mode,
            gravity,
            x: 9,
            y: 2,
          };
          for (const status of ["playing", "dead"]) {
            state.status = status;
            const options = {
              state,
              level,
              camera: 5,
              cameraY: 1,
              time: 0.2,
              reduced: false,
              avatar: engine.SIZE, // draw at the legacy size here; the app default is larger (tests/avatar.test.mjs)
            };
            assert.deepEqual(
              commands(render, options),
              relabel(commands(legacy.render, legacyOptions(options))),
              `${level.name}/${mode}/${gravity}/${status}`,
            );
          }
        }
    const options = {
      state: null,
      level: LEVELS[8],
      editing: true,
      selected: 0,
      camera: 2,
      cameraY: 1,
      areaTop: 68,
      areaBottom: 240,
    };
    assert.deepEqual(
      commands(render, options),
      relabel(commands(legacy.render, legacyOptions(options))),
    );
  });
});

test("transforms, geometry, saves and every original song retain baseline results", async () => {
  await withLegacy((old, _, library, music) => {
    // The baseline's own types: pieces added since (the angle portal, the pass blocks) have no legacy shape.
    for (const type of old.TYPES)
      for (const rotation of [0, 90, 180, 270])
        for (const flipX of [false, true])
          for (const flipY of [false, true]) {
            const a = { ...old.object(type, 5, 2), rotation, flipX, flipY },
              b = { ...structuredClone(a), type: modernId(type) };
            assert.deepEqual(engine.polygon(b), old.polygon(a));
            for (const action of [
              "left",
              "right",
              "up",
              "down",
              "cw",
              "ccw",
              "flipX",
              "flipY",
            ]) {
              assert.deepEqual(engine.transform(b, action, 0.05), {
                ...old.transform(a, action, 0.05),
                type: modernId(type),
              });
            }
          }
    for (let i = 0; i < 109; i++)
      assert.deepEqual(trackFor(i), music.trackFor(i));
    const draft = {
      name: "Saved before migration",
      length: 40,
      objects: [engine.object("grid", 6)],
      height: 12,
      song: 31,
    };
    for (const raw of [
      null,
      JSON.stringify({
        version: 1,
        best: { 0: 100, 8: 52 },
        sound: true,
        draft,
      }),
      JSON.stringify({ ...readSave(null, 9), draft }),
    ])
      assert.deepEqual(readSave(raw, 9), library.readSave(raw, 9));
    for (const raw of [
      "{bad",
      "null",
      "{}",
      JSON.stringify({ version: 2, best: {}, draft }),
    ]) {
      assert.throws(() => readSave(raw, 9));
      assert.throws(() => library.readSave(raw, 9));
    }
  });
});

test("run interruption clears held and buffered input without advancing physics", () => {
  const run = new Run({ name: "Empty", length: 40, objects: [] });
  run.advance(0.05);
  run.press();
  const before = structuredClone(run.state);
  run.interrupt();
  assert.deepEqual(run.state, before);
  assert.equal(run.held, false);
  assert.equal(run.jumpBuffer, 0);
  assert.equal(run.acc, 0);
});

test("fixed-step run is stable across render cadence after the ready interval", () => {
  const snapshots = [30, 60, 120].map((hz) => {
    const run = new Run({ name: "Empty", length: 100, objects: [] });
    run.readyTime = 0;
    for (let i = 0; i < hz * 2; i++) run.advance(1 / hz);
    return run.state;
  });
  assert.deepEqual(snapshots[0], snapshots[1]);
  assert.deepEqual(snapshots[1], snapshots[2]);
});

test("contact, ramp span and ceiling tolerances match the pinned original", async () => {
  await withLegacy((old) => {
    const block = (x) => ({
      type: "block",
      x,
      y: 1,
      rotation: 0,
      flipX: false,
      flipY: false,
    });
    // Separation either side of the contact tolerance, which no other test drives.
    for (const gap of [0, 0.000005, 0.00001, 0.00002, 0.0001, 0.5]) {
      assert.equal(
        engine.intersects(
          engine.polygon(block(3)),
          engine.polygon(block(4 - gap)),
        ),
        old.intersects(old.polygon(block(3)), old.polygon(block(4 - gap))),
        `contact at gap ${gap}`,
      );
    }
    // A ramp span narrower than the tolerance reports no surface at all.
    const ramp = {
      type: "ramp",
      x: 3,
      y: 1,
      rotation: 0,
      flipX: false,
      flipY: false,
    };
    for (const span of [0.000005, 0.00001, 0.00002, 0.0001, 0.001]) {
      assert.equal(
        engine.rampSurface(ramp, 3.5, 3.5 + span, true),
        old.rampSurface(ramp, 3.5, 3.5 + span, true),
        `ramp span ${span}`,
      );
    }
    // The per-object vertical bound refuses a one-high block before the ceiling check
    // runs, so reaching that tolerance needs a tall shape in a tall world.
    const attempt = (validate, level) => {
      try {
        validate(level);
        return "accepted";
      } catch (error) {
        return error.message;
      }
    };
    for (const dy of [-0.001, -0.00001, 0, 0.00001, 0.00002, 0.001]) {
      const level = {
        name: "Ceiling",
        length: 40,
        height: 10,
        objects: [
          {
            type: "plane",
            x: 5,
            y: 10 - 2.5 + dy,
            rotation: 0,
            flipX: false,
            flipY: false,
          },
        ],
      };
      assert.equal(
        attempt(engine.validateLevel, level),
        attempt(old.validateLevel, level),
        `ceiling at ${dy}`,
      );
    }
  });
});

test("a validated level is isolated from the object it was built from", async () => {
  await withLegacy((old) => {
    // The difference between a deep and a shallow return is invisible until something
    // writes to the result, so write to it and read the source back.
    for (const validate of [engine.validateLevel, old.validateLevel]) {
      const source = {
        name: "Isolated",
        length: 40,
        height: 7,
        objects: [engine.object("block", 5)],
      };
      const validated = validate(source);
      validated.objects[0].x = 99;
      validated.name = "Changed";
      assert.equal(source.objects[0].x, 5);
      assert.equal(source.name, "Isolated");
    }
  });
});
