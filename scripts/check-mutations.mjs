import { mkdtemp, cp, readFile, writeFile, rm } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import assert from "node:assert/strict";

const dir = await mkdtemp(join(tmpdir(), "clonedash-mutants-"));
try {
  await cp("src", join(dir, "src"), { recursive: true });
  await cp("scripts/version.mjs", join(dir, "scripts", "version.mjs"));
  // Keep relative imports valid, and run git reads from the real repository below.
  for (const testFile of [
    "migration.test.mjs",
    "transfer.test.mjs",
    "courses.test.mjs",
    "course-input.mjs",
    "remix-inputs.mjs",
    "version.test.mjs",
    "pogo.test.mjs",
    "coins.test.mjs",
    "triggers.test.mjs",
    "parity.test.mjs",
    "angle.test.mjs",
    "boosters.test.mjs",
    "size.test.mjs",
    "swipe.test.mjs",
    "gesture.test.mjs",
  ]) {
    const testSource = (await readFile(join("tests", testFile), "utf8"))
      .replaceAll("../src/", "./src/")
      .replaceAll("../scripts/", "./scripts/");
    await writeFile(join(dir, testFile), testSource);
  }
  await cp("tests/fixtures", join(dir, "fixtures"), { recursive: true });
  const run = (pattern, testFile) =>
    spawnSync(
      process.execPath,
      [
        "--experimental-strip-types",
        "--test",
        `--test-name-pattern=${pattern}`,
        join(dir, testFile),
      ],
      { encoding: "utf8" },
    );
  for (const [file, from, to, pattern, testFile = "migration.test.mjs"] of [
    ["engine.ts", "SPEED = 5,", "SPEED = 5.1,", "typed engine matches"],
    [
      "render.ts",
      "h - Math.max(42, h * 0.16)",
      "h - Math.max(42, h * 0.18)",
      "drawing commands match",
    ],
    [
      "engine.ts",
      "Math.min(...bb) + 0.00001",
      "Math.min(...bb) + 0.0001",
      "contact, ramp span and ceiling tolerances",
    ],
    [
      "engine.ts",
      "hi <= lo + 0.00001",
      "hi <= lo + 0.0001",
      "contact, ramp span and ceiling tolerances",
    ],
    [
      "engine.ts",
      "bounds(o).top > height + 0.00001",
      "bounds(o).top > height + 0.01",
      "contact, ramp span and ceiling tolerances",
    ],
    [
      "engine.ts",
      "const level = structuredClone(raw);",
      "const level = raw;",
      "isolated from the object it was built from",
    ],
    [
      "transfer.ts",
      "size > MAX_LEVEL_BYTES",
      "size > MAX_LEVEL_BYTES * 100",
      "inflation stops and cancels",
      "transfer.test.mjs",
    ],
    [
      "transfer.ts",
      "text.length > MAX_CODE",
      "text.length > MAX_CODE * 100",
      "encoded bound rejects",
      "transfer.test.mjs",
    ],
    [
      "transfer.ts",
      "storage.getItem(SAVE) ?? JSON.stringify(fallback)",
      "JSON.stringify(fallback)",
      "confirmation rereads storage",
      "transfer.test.mjs",
    ],
    [
      "transfer.ts",
      "...structuredClone(save.customLevels),",
      "",
      "import appends independently",
      "transfer.test.mjs",
    ],
    ["transfer.ts", "if (openInEditor) selectLevel", "if (false) selectLevel", "copy re-reads", "courses.test.mjs"],
    // The legacy id migration has to reach the save, not only the validator's return value.
    ["library.ts", "s.draft = validateLevel(s.draft);", "validateLevel(s.draft);", "readSave loads a jumper save", "pogo.test.mjs"],
    ["levels.ts", "LEVELS.push(...COURSES)", "LEVELS.unshift(...COURSES)", "groups preserve", "courses.test.mjs"],
    ["levels.ts", "LEVELS.push(...REMIX)", "LEVELS.unshift(...REMIX)", "groups preserve", "courses.test.mjs"],
    ["courses.ts", "song: 109", "song: 110", "groups preserve", "courses.test.mjs"],
    // Coins and triggers (#101, docs/coins-and-triggers.md): each rule fails its own test.
    ["engine.ts", "coinCount(level) > MAX_COINS", "coinCount(level) > MAX_COINS + 1", "coin cap", "coins.test.mjs"],
    ["library.ts", "entry.coins = got;", "entry.coins = (entry.coins ?? 0) + got;", "best coins", "coins.test.mjs"],
    ["engine.ts", "if (fx.fired[t]) continue;", "if (false) continue;", "instant move by the offset", "triggers.test.mjs"],
    ["engine.ts", "fx.groups.get(o.target);", "[...fx.groups.values()].flat();", "its group only", "triggers.test.mjs"],
    ["engine.ts", "fx.move[m + 2] = o.moveX ?? 0;", "fx.move[m + 2] = o.moveY ?? 0;", "instant move by the offset", "triggers.test.mjs"],
    ["engine.ts", "if (!fx.tinted[i]) return null;", "if (!fx.tinted.some(Boolean)) return null;", "its group only", "triggers.test.mjs"],
    ["engine.ts", "level: moves ? { ...level, objects: level.objects.map((o) => ({ ...o })) } : level,", "level,", "instant move by the offset", "triggers.test.mjs"],
    ["run.ts", "createState(this.level);\n    this.deathTime", "createState(this.state.level);\n    this.deathTime", "restart, death and leaving", "triggers.test.mjs"],
    // a new move must start from the current pose, not from where the replaced move started
    ["engine.ts", "fx.move[m] = p.x;", "fx.move[m] = fx.movers.includes(i) ? fx.move[m] : p.x;", "overlap", "triggers.test.mjs"],
    // a step's two contact passes (settle): fire on resolved reach, redo on the moved pose from the
    // state before contact, fire nothing in the redo
    ["engine.ts", "  fx.picked.length = 0;\n  contact(s, oldX, oldY, wasGrounded, height, forward, dt);\n  if (!runTriggers(s, fx)) return;", "  fx.picked.length = 0;\n  runTriggers(s, fx);\n  contact(s, oldX, oldY, wasGrounded, height, forward, dt);\n  if (s) return;", "a trigger fires on where the run really is", "triggers.test.mjs"],
    ["engine.ts", "  if (!runTriggers(s, fx)) return;", "  runTriggers(s, fx);\n  if (s) return;", "an instant move clears the way in the very step it fires", "triggers.test.mjs"],
    ["engine.ts", "gravity, mode, touchingPortals, dash });", "gravity, mode, dash });", "a second contact pass starts from the state before the step", "triggers.test.mjs"],
    ["engine.ts", "  for (const i of fx.picked) fx.got[i] = 0;\n  fx.coins = coins;\n", "", "a portal or a coin moved away", "triggers.test.mjs"],
    ["engine.ts", "  contact(s, oldX, oldY, wasGrounded, height, forward, dt);\n}\nfunction contact(", "  contact(s, oldX, oldY, wasGrounded, height, forward, dt);\n  runTriggers(s, fx);\n}\nfunction contact(", "a cascade waits a step", "triggers.test.mjs"],
    ["transfer.ts", "...(group === undefined ? {} : { group }),", "group,", "old share codes captured on main", "parity.test.mjs"],
    ["library.ts", "s.coins !== undefined &&", "true &&", "old saves captured on main", "parity.test.mjs"],
    // #106, docs/ramps-and-boosters.md: each rule of the round fails its own test.
    // 1. angle: solid contact kills before any snap, with the whole body, both gravities; W and R
    // keep their meaning; the old witnesses are the control
    ["engine.ts", 'if (s.mode === "angle" && (BLOCKS.includes(o.type) || SLOPES.includes(o.type))) {', "if (false) {", "angle dies on solid contact", "angle.test.mjs"],
    ["engine.ts", 'if (s.mode === "angle" && (BLOCKS.includes(o.type) || SLOPES.includes(o.type))) {', "if (false) {", "the old witnesses of the re-recorded angle sections", "parity.test.mjs"],
    ["engine.ts", "playerPolygon(s, w ? DEATH_INSET : 0)", "playerPolygon(s, DEATH_INSET)", "angle dies on solid contact", "angle.test.mjs"],
    ["engine.ts", "if (w && oldX + SIZE - DEATH_INSET <= b.left + 0.001) {", "if (false) {", "the explicit overrides keep their meaning", "angle.test.mjs"],
    ["engine.ts", "        (inR || o.roofPass) &&\n        BLOCKS.includes(o.type) &&\n        (s.gravity < 0", "        false &&\n        (s.gravity < 0", "the explicit overrides keep their meaning", "angle.test.mjs"],
    ["engine.ts", ": oldY >= b.top - 0.015 && s.vy < 0)", ": false)", "the explicit overrides keep their meaning", "angle.test.mjs"],
    // 3. drop and stop
    ["engine.ts", "export const DROP_SPEED = 24;", "export const DROP_SPEED = 20;", "a black ring sends you down", "boosters.test.mjs"],
    ["engine.ts", "} else if (e.drop) s.vy = s.gravity * DROP_SPEED;", "} else if (e.drop) s.vy = -DROP_SPEED;", "a black ring sends you down", "boosters.test.mjs"],
    ["engine.ts", "else if (e.stop) s.vy = 0;", "else if (e.stop) s.vy += 0;", "a black ring sends you down", "boosters.test.mjs"],
    ["engine.ts", "    !halt &&\n", "", "a drop or stop ring is the step", "boosters.test.mjs"],
    ["engine.ts", "      s.dash = null;\n      halt = true;", "      halt = true;", "a drop or stop ring is the step", "boosters.test.mjs"],
    ["engine.ts", 'if (s.mode === "angle" && (o.drop || o.stop)) return false;', "", "in angle mode a black or gray ring is not ready", "boosters.test.mjs"],
    ["engine.ts", '(key === "drop" && o.stop !== undefined))', "false)", "every reader refuses a drop or stop", "boosters.test.mjs"],
    ["transfer.ts", "...(drop === undefined ? {} : { drop }),", "", "a share code keeps the black and gray rings", "boosters.test.mjs"],
    // 4. boosters
    ["engine.ts", "pads.find((i) => !s.fx!.pads.includes(i))", "pads.find(() => true)", "a booster fires once per touch", "boosters.test.mjs"],
    ["engine.ts", "    s.fx.pads = pads;\n  }\n}", "    s.fx.pads = [...new Set([...s.fx.pads, ...pads])];\n  }\n}", "a booster fires once per touch", "boosters.test.mjs"],
    ["engine.ts", 'if (s.mode === "angle") pads.length = 0;', "", "boosters are inert in angle mode", "boosters.test.mjs"],
    ["engine.ts", '"pink-pad": { bounce: 1 },', '"pink-pad": { bounce: 2 },', "each booster does what its ring does", "boosters.test.mjs"],
    ["engine.ts", "pads.find(", "pads.findLast(", "one booster a step", "boosters.test.mjs"],
    ["engine.ts", "  fx.pads = pads;\n  for (const i of fx.picked)", "  for (const i of fx.picked)", "a booster first touched in a step where an instant move goes elsewhere", "boosters.test.mjs"],
    ["engine.ts", "touchingPortals, dash });", "touchingPortals });", "a booster an instant move takes away in that step", "boosters.test.mjs"],
    ["engine.ts", "!triggers.length && !pads) return null;", "!triggers.length) return null;", "a level with no booster, coin or trigger", "boosters.test.mjs"],
    // 5. size
    ["engine.ts", "export const SCALABLE = TYPES.filter((t) => !TRIGGERS.includes(t));", "export const SCALABLE = TYPES.filter((t) => TURNABLE.includes(t));", "the ceiling covers sized rings", "size.test.mjs"],
    ["engine.ts", "const [cx, cy] = pointOf(o, 0.5, 0.5),", "const [cx, cy] = [o.x + 0.5, o.y + 0.5],", "a sized ring is reached at its drawn centre", "size.test.mjs"],
    ["engine.ts", "r = 0.6 * scaleOf(o);", "r = 0.6;", "a sized ring is reached at its drawn centre", "size.test.mjs"],
    ["engine.ts", "if (o.x - r > s.x + SIZE + 1 || o.x + r < s.x - 1) continue;", "if (o.x > s.x + 2 * scaleOf(o) || o.x < s.x - 2 * scaleOf(o)) continue;", "a sized portal, coin and booster are touched by their real shape", "size.test.mjs"],
    ["engine.ts", "if ((raw.height !== undefined || sizedNew) && bounds", "if ((raw.height !== undefined) && bounds", "the ceiling covers sized rings", "size.test.mjs"],
    ["render.ts", "[mx, my] = pointOf(o, 0.5, 0.5);", "[mx, my] = [o.x + 0.5, o.y + 0.5];", "drawn at the centre and size they are touched at", "size.test.mjs"],
    ["render.ts", "ctx.arc(X(mx), Y(my), unit * 0.45 * s, 0, Math.PI * 2);", "ctx.arc(X(mx), Y(my), unit * 0.45, 0, Math.PI * 2);", "drawn at the centre and size they are touched at", "size.test.mjs"],
    ["gesture.ts", "angleStep = turnable ?", "angleStep = scalable ?", "the pinch starts from the piece as it is", "gesture.test.mjs"],
    // 6. swipe
    ["swipe.ts", "while (i !== ei || j !== ej) {", "while (false) {", "a drag covers every cell", "swipe.test.mjs"],
    ["swipe.ts", "if (j === ej || (i !== ei && tx < ty)) {", "if (j === ej || i !== ei) {", "a drag covers every cell", "swipe.test.mjs"],
    ["swipe.ts", "(o) => o.layer === piece.layer && o.x === piece.x && o.y === piece.y && over(o.type) === zone,", "(o) => false,", "painting a cell keeps a tap", "swipe.test.mjs"],
    ["swipe.ts", 'if (piece.type === "coin" && coinCount(level) >= MAX_COINS) return "coins";', "", "painting a cell keeps a tap", "swipe.test.mjs"],
    ["swipe.ts", 'if (level.objects.length >= MAX_OBJECTS) return "full";', "", "painting a cell keeps a tap", "swipe.test.mjs"],
    ["swipe.ts", "(o) => o.layer !== layer || !parts", "(o) => !parts", "erasing removes what the drag passes over", "swipe.test.mjs"],
    ["swipe.ts", "if (same(step.before, step.after)) return false;", "", "one stroke that changed something is one undo step", "swipe.test.mjs"],
    ["swipe.ts", "    this.undone = [];\n    return true;", "    return true;", "one stroke that changed something is one undo step", "swipe.test.mjs"],
    ["swipe.ts", "if (!same(current, step.after)) return this.miss();", "", "an edit the history did not make invalidates it", "swipe.test.mjs"],
    ["swipe.ts", "if (this.done.length > this.limit) this.done.shift();", "", "an edit the history did not make invalidates it", "swipe.test.mjs"],
    // Release identity guards: each rejection must fail against its broken control.
    [
      "scripts/version.mjs",
      "dirty || shallow || !anchor",
      "dirty || !anchor",
      "shallow clone cannot release",
      "version.test.mjs",
    ],
    [
      "scripts/version.mjs",
      "dirty || shallow || !anchor",
      "shallow || !anchor",
      "first-parent anchors",
      "version.test.mjs",
    ],
    [
      "scripts/version.mjs",
      "/^v(0|[1-9]\\d*)\\.(0|[1-9]\\d*)$/",
      "/^v\\d+\\.\\d+(\\.\\d+)?$/",
      "look-alikes never satisfy",
      "version.test.mjs",
    ],
  ]) {
    const path = join(dir, file.includes("/") ? file : join("src", file)),
      original = await readFile(path, "utf8");
    assert(original.includes(from), `mutant target moved: ${file}`);
    let result = run(pattern, testFile);
    assert.equal(result.status, 0, result.stderr + result.stdout);
    await writeFile(path, original.replace(from, to));
    result = run(pattern, testFile);
    assert.equal(
      result.status,
      1,
      `mutant survived: ${file}\n${result.stdout}`,
    );
    assert.match(
      result.stdout,
      /AssertionError|ERR_ASSERTION/,
      "mutation must fail the oracle, not module loading",
    );
    await writeFile(path, original);
    console.log(`caught ${file}: ${from} -> ${to}`);
  }
} finally {
  await rm(dir, { recursive: true, force: true });
}
