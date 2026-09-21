import test from "node:test";
import assert from "node:assert/strict";
import { createState, SIZE } from "../src/engine.ts";
import { LEVELS } from "../src/levels.ts";
import { render, AVATAR } from "../src/render.ts";

// The player is drawn larger than its physics body (visual-only, see AVATAR in render.ts).
// Pin the three things that make that safe: the shape scales uniformly by k = AVATAR / SIZE,
// the feet sit on the body's bottom edge under normal gravity, and the head sits on the body's
// top edge when inverted. Both anchors are symmetric around the legacy center, so at
// avatar === SIZE the drawing is byte-identical to the pre-migration tree (migration.test.mjs).
Object.assign(globalThis, { innerWidth: 932, innerHeight: 430, devicePixelRatio: 2 });
function commands(options) {
  const log = [];
  const ctx = new Proxy(
    {},
    {
      set(target, key, value) {
        target[key] = value;
        return true;
      },
      get(target, key) {
        if (key in target) return target[key];
        return (...args) => {
          log.push([key, ...args]);
          if (key === "createLinearGradient") return { addColorStop() {} };
        };
      },
    },
  );
  render({ width: 1864, height: 860, getContext: () => ctx }, options);
  return log;
}
const draw = (gravity, avatar) => {
  const state = { ...createState(LEVELS[0]), mode: "square", gravity, x: 9, y: 2 };
  const log = commands({ state, level: LEVELS[0], camera: 5, cameraY: 1, time: 0.2, reduced: false, ...(avatar === undefined ? {} : { avatar }) });
  const translates = log.filter((c) => c[0] === "translate");
  const player = translates.at(-1); // the avatar is the last thing translated to
  const avatarLog = log.slice(log.lastIndexOf(player)); // only the avatar's own commands
  const square = avatarLog.find((c) => c[0] === "fillRect" && c[3] === c[4] && c[1] === -c[3] / 2); // fillRect(-a/2, -a/2, a, a)
  return { y: player[2], scale: avatarLog.filter((c) => c[0] === "scale" && c[1] === c[2]), side: square[3] };
};

test("the player is drawn one block wide, feet on the floor and head on the ceiling", () => {
  assert.equal(AVATAR, 1, "product choice: same size as the blocks");
  const k = AVATAR / SIZE;
  const legacy = { down: draw(-1, SIZE), up: draw(1, SIZE) };
  const now = { down: draw(-1), up: draw(1) };
  // legacy size: no uniform scale is emitted and both gravities share the body center
  assert.equal(legacy.down.scale.length, 0);
  assert.equal(legacy.up.scale.length, 0);
  assert.equal(legacy.down.y, legacy.up.y);
  // default: exactly one uniform scale by k, so every mode's shape grows together
  assert.deepEqual(now.down.scale, [["scale", k, k]]);
  assert.deepEqual(now.up.scale, [["scale", k, k]]);
  // the legacy square side is SIZE * unit, so half the growth in pixels is side * (k - 1) / 2.
  // feet anchor moves the center UP the screen by that; head anchor moves it DOWN by the same.
  const half = (legacy.down.side * (k - 1)) / 2;
  assert.ok(Math.abs(legacy.down.y - now.down.y - half) < 1e-9, "feet on the body's bottom edge");
  assert.ok(Math.abs(now.up.y - legacy.up.y - half) < 1e-9, "head on the body's top edge");
});
