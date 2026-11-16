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
    "skin.test.mjs",
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
      "size > limit",
      "size > limit * 100",
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
    ["engine.ts", "gravity, mode, touchingPortals });", "gravity, mode });", "a second contact pass starts from the state before the step", "triggers.test.mjs"],
    ["engine.ts", "  for (const i of fx.picked) fx.got[i] = 0;\n  fx.coins = coins;\n", "", "a portal or a coin moved away", "triggers.test.mjs"],
    ["engine.ts", "  contact(s, oldX, oldY, wasGrounded, height, forward, dt);\n}\nfunction contact(", "  contact(s, oldX, oldY, wasGrounded, height, forward, dt);\n  runTriggers(s, fx);\n}\nfunction contact(", "a cascade waits a step", "triggers.test.mjs"],
    ["transfer.ts", "...(group === undefined ? {} : { group }),", "group,", "old share codes captured on main", "parity.test.mjs"],
    ["library.ts", "s.coins !== undefined &&", "true &&", "old saves captured on main", "parity.test.mjs"],
    // Skins (#107, docs/skins.md): a dropped bound, an overwritten save, a skin in the wrong mode,
    // shifted anchoring and a changed body must each fail their own test.
    ["skin.ts", "(v as number) <= MAX_SIDE", "true", "the schema: every bound", "skin.test.mjs"],
    ["skin.ts", "if (store.skins.length >= MAX_SKINS)", "if (false)", "the store: 100 skins", "skin.test.mjs"],
    ["skin.ts", "new DecompressionStream(\"deflate-raw\")),\n      MAX_SKIN_BYTES,", "new DecompressionStream(\"deflate-raw\")),\n      MAX_SKIN_BYTES * 100,", "skin inflation is bounded", "skin.test.mjs"],
    ["skin.ts", "const portable = (skin: Skin) => validateSkin(skin);", "const portable = (skin: Skin) => skin;", "the export carries", "skin.test.mjs"],
    ["skin.ts", "latest = readSkins(storage.getItem(SKINS));", "latest = emptyStore();", "stale-tab preservation", "skin.test.mjs"],
    ["skin.ts", "    throw Error(\"Your saved skins could not be read, so nothing was changed.\");", "    latest = emptyStore();", "refused, unconfirmed and invalid writes", "skin.test.mjs"],
    ["skin.ts", "if (storage.getItem(SKINS) !== raw)", "if (false)", "refused, unconfirmed and invalid writes", "skin.test.mjs"],
    ["transfer.ts", "if (params.getAll(\"level\").length !== 1 || params.has(\"skin\"))", "if (params.getAll(\"level\").length !== 1)", "wrong-kind skin codes", "skin.test.mjs"],
    ["transfer.ts", "if (levels + skins !== 1)", "if (levels + skins < 1)", "import dispatches by prefix", "skin.test.mjs"],
    ["render.ts", "if (state.mode === \"square\" && skin) {", "if (skin) {", "a skin draws in square mode only", "skin.test.mjs"],
    ["skin.ts", "bottom = s.gravity > 0 ? s.y + SIZE - h : s.y;", "bottom = s.gravity > 0 ? s.y + SIZE - h : s.y + (1 - h) / 2;", "anchors feet", "skin.test.mjs"],
    ["skin.ts", "bottom = s.gravity > 0 ? s.y + SIZE - h : s.y;", "bottom = s.gravity > 0 ? s.y + SIZE - 1 + (1 - h) / 2 : s.y;", "anchors feet", "skin.test.mjs"],
    ["skin.ts", "Math.min(center, s.wall - w / 2)", "Math.min(center, s.wall - 0.5)", "anchors feet", "skin.test.mjs"],
    ["engine.ts", "SIZE = 0.64,", "SIZE = 0.7,", "a skin never changes the body", "skin.test.mjs"],
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
