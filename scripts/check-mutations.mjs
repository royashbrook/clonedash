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
    "explorer-inputs.mjs",
    "version.test.mjs",
    "pogo.test.mjs",
    "door.test.mjs",
    "follow.test.mjs",
    "coins.test.mjs",
    "triggers.test.mjs",
    "parity.test.mjs",
    "angle.test.mjs",
    "boosters.test.mjs",
    "size.test.mjs",
    "swipe.test.mjs",
    "gesture.test.mjs",
    "skin.test.mjs",
    "width-height-touch-multi.test.mjs",
    "backup.test.mjs",
    "compose-graph.test.mjs",
    "audio-graph.mjs",
    "loop.test.mjs",
    "loop-player.test.mjs",
    "loop-level.test.mjs",
    "music-lifetime.test.mjs",
    "spin.test.mjs",
    "canvas-log.mjs",
    "teleport.test.mjs",
    "edges.test.mjs",
    "framing.test.mjs",
    "loop-length.test.mjs",
    "loop-song.test.mjs",
    "song-arranger.test.mjs",
    "start-settings.test.mjs",
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
    ["engine.ts", 'bind.axis === "y" ? 0 : x - bind.x', 'x - bind.x', "player follow preserves", "follow.test.mjs"],
    ["engine.ts", "if (fx.follows) followAll(s, fx, oldX, oldY);", "", "player follow preserves", "follow.test.mjs"],
    ["engine.ts", "mode: level.startMode ?? \"square\"", "mode: \"square\"", "every starting mode", "start-settings.test.mjs"],
    ["engine.ts", "speed: level.startSpeed ?? 1", "speed: 1", "every starting mode", "start-settings.test.mjs"],
    ["engine.ts", "s.x >= s.level.length", "s.x >= s.level.length + (s.level.offMap ? 32 : 0)", "same finish", "start-settings.test.mjs"],
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
    ["levels.ts", "LEVELS.push(...EXPLORER)", "LEVELS.unshift(...EXPLORER)", "groups preserve", "courses.test.mjs"],
    ["courses.ts", "song: 109", "song: 110", "groups preserve", "courses.test.mjs"],
    // Coins and triggers (#101, docs/coins-and-triggers.md): each rule fails its own test.
    ["engine.ts", "coinCount(level) > MAX_COINS", "coinCount(level) > MAX_COINS + 1", "coin cap", "coins.test.mjs"],
    ["library.ts", "entry.coins = got;", "entry.coins = (entry.coins ?? 0) + got;", "best coins", "coins.test.mjs"],
    ["engine.ts", "else if (fx.fired[t] || s.x < o.x) continue;", "else if (s.x < o.x) continue;", "instant move by the offset", "triggers.test.mjs"],
    ["engine.ts", "fx.groups.get(o.target);", "[...fx.groups.values()].flat();", "its group only", "triggers.test.mjs"],
    ["engine.ts", "fx.move[m + 2] = o.moveX ?? 0;", "fx.move[m + 2] = o.moveY ?? 0;", "instant move by the offset", "triggers.test.mjs"],
    ["engine.ts", "if (!fx.tinted[i]) return null;", "if (!fx.tinted.some(Boolean)) return null;", "its group only", "triggers.test.mjs"],
    ["engine.ts", "level: moves ? { ...level, objects: level.objects.map((o) => ({ ...o })) } : level,", "level,", "instant move by the offset", "triggers.test.mjs"],
    ["run.ts", "createState(this.level);\n    this.deathTime", "createState(this.state.level);\n    this.deathTime", "restart, death and leaving", "triggers.test.mjs"],
    // a new move must start from the current pose, not from where the replaced move started
    ["engine.ts", "fx.move[m] = p.x;", "fx.move[m] = fx.movers.includes(i) ? fx.move[m] : p.x;", "overlap", "triggers.test.mjs"],
    // a step's two contact passes (settle): fire on resolved reach, redo on the moved pose from the
    // state before contact, fire nothing in the redo
    ["engine.ts", "  fx.picked.length = 0;\n  contact(s, oldX, oldY, wasGrounded, height, forward, dt);\n  if (runTriggers(s, fx)) {", "  fx.picked.length = 0;\n  runTriggers(s, fx);\n  contact(s, oldX, oldY, wasGrounded, height, forward, dt);\n  if (!s) {", "a trigger fires on where the run really is", "triggers.test.mjs"],
    ["engine.ts", "  if (runTriggers(s, fx)) {", "  runTriggers(s, fx);\n  if (!s) {", "an instant move clears the way in the very step it fires", "triggers.test.mjs"],
    ["engine.ts", "gravity, mode, touchingPortals, dash });", "gravity, mode, dash });", "a second contact pass starts from the state before the step", "triggers.test.mjs"],
    ["engine.ts", "    for (const i of fx.picked) fx.got[i] = 0;\n    fx.coins = coins;\n", "", "a portal or a coin moved away", "triggers.test.mjs"],
    ["engine.ts", "    contact(s, oldX, oldY, wasGrounded, height, forward, dt);\n  }\n  // a teleport trigger moves you last", "    contact(s, oldX, oldY, wasGrounded, height, forward, dt);\n    runTriggers(s, fx);\n  }\n  // a teleport trigger moves you last", "a cascade waits a step", "triggers.test.mjs"],
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
    ["engine.ts", 'if (s.mode === "angle" && (o.type === "drop-ring" || o.type === "stop-ring")) return false;', "", "in angle mode a black or gray ring is not ready", "boosters.test.mjs"],
    ["engine.ts", '"drop-ring": { drop: true }', '"drop-ring": {}', "a black ring sends you down", "boosters.test.mjs"],
    // a black or gray ring is its own piece: the plain ring's fields stay refused on it
    ["engine.ts", '(o.type !== "ring" ||\n        !Number.isFinite(o.bounce)', '(!RINGS.includes(o.type) ||\n        !Number.isFinite(o.bounce)', "every reader refuses a black or gray ring mixed", "boosters.test.mjs"],
    ["engine.ts", '(o.type !== "ring" || o.flipsGravity !== true', '(!RINGS.includes(o.type) || o.flipsGravity !== true', "every reader refuses a black or gray ring mixed", "boosters.test.mjs"],
    // 4. boosters
    ["engine.ts", "pads.find((i) => !s.fx!.pads.includes(i))", "pads.find(() => true)", "a booster fires once per touch", "boosters.test.mjs"],
    ["engine.ts", "    s.fx.pads = pads;\n  }\n}", "    s.fx.pads = [...new Set([...s.fx.pads, ...pads])];\n  }\n}", "a booster fires once per touch", "boosters.test.mjs"],
    ["engine.ts", '        s.mode === "angle"\n          ? []', "        false\n          ? []", "boosters are inert in angle mode", "boosters.test.mjs"],
    // a booster is touched by the final pose, after every portal and support
    ["engine.ts", "const final = playerPolygon(s),", "const final = body,", "a booster is touched by the final pose", "boosters.test.mjs"],
    // the plane's limit holds in the step a booster fires
    ["engine.ts", '      if (s.mode === "plane") s.vy = Math.max(-4, Math.min(4, s.vy));\n', "", "in a plane the speed limit holds in the step a booster fires", "boosters.test.mjs"],
    ["engine.ts", '"pink-pad": { bounce: 1 },', '"pink-pad": { bounce: 2 },', "each booster does what its ring does", "boosters.test.mjs"],
    ["engine.ts", "pads.find(", "pads.findLast(", "one booster a step", "boosters.test.mjs"],
    ["engine.ts", "    fx.pads = pads;\n    for (const i of fx.picked)", "    for (const i of fx.picked)", "a booster first touched in a step where an instant move goes elsewhere", "boosters.test.mjs"],
    ["engine.ts", "touchingPortals, dash });", "touchingPortals });", "a booster an instant move takes away in that step", "boosters.test.mjs"],
    ["engine.ts", "!triggers.length && !boosters.length && !teleports) return null;", "!triggers.length && !teleports) return null;", "a level with no booster, coin or trigger", "boosters.test.mjs"],
    // 5. size
    ["engine.ts", "export const SCALABLE = TYPES.filter((t) => !TRIGGERS.includes(t));", "export const SCALABLE = TYPES.filter((t) => TURNABLE.includes(t));", "the ceiling covers sized rings", "size.test.mjs"],
    ["engine.ts", "const [cx, cy] = pointOf(o, 0.5, 0.5);", "const [cx, cy] = [o.x + 0.5, o.y + 0.5];", "a sized ring is reached at its drawn centre", "size.test.mjs"],
    ["engine.ts", "r = 0.6 * scaleOf(o);", "r = 0.6;", "a sized ring is reached at its drawn centre", "size.test.mjs"],
    ["engine.ts", "if (o.x - r > s.x + SIZE + 1 || o.x + r < s.x - 1) continue;", "if (o.x > s.x + 2 * scaleOf(o) || o.x < s.x - 2 * scaleOf(o)) continue;", "a sized portal, coin and booster are touched by their real shape", "size.test.mjs"],
    ["engine.ts", "(raw.height !== undefined || sizedNew) && bounds", "(raw.height !== undefined) && bounds", "the ceiling covers sized rings", "size.test.mjs"],
    ["render.ts", "[mx, my] = pointOf(o, 0.5, 0.5),", "[mx, my] = [o.x + 0.5, o.y + 0.5],", "drawn at the centre and size they are touched at", "size.test.mjs"],
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
    // Skins (#107, docs/skins.md): a dropped bound, an overwritten save, a skin in the wrong mode,
    // shifted anchoring and a changed body must each fail their own test.
    ["skin.ts", "(v as number) <= MAX_SIDE", "true", "the schema: every bound", "skin.test.mjs"],
    ["skin.ts", "if (store.skins.length >= MAX_SKINS)", "if (false)", "the store: 100 skins", "skin.test.mjs"],
    ["skin.ts", "await unpackCode(code, PREFIX, MAX_SKIN_BYTES, \"skin\")", "await unpackCode(code, PREFIX, MAX_SKIN_BYTES * 100, \"skin\")", "skin inflation is bounded", "skin.test.mjs"],
    ["skin.ts", "const portable = (skin: Skin) => validateSkin(skin);", "const portable = (skin: Skin) => skin;", "the export carries", "skin.test.mjs"],
    ["skin.ts", "latest = readSkins(storage.getItem(SKINS));", "latest = emptyStore();", "stale-tab preservation", "skin.test.mjs"],
    ["skin.ts", "    throw Error(\"Your saved skins could not be read, so nothing was changed.\");", "    latest = emptyStore();", "refused, unconfirmed and invalid writes", "skin.test.mjs"],
    ["skin.ts", "if (storage.getItem(SKINS) !== raw)", "if (false)", "refused, unconfirmed and invalid writes", "skin.test.mjs"],
    ["transfer.ts", "if (params.getAll(\"level\").length !== 1 || params.has(\"skin\"))", "if (params.getAll(\"level\").length !== 1)", "wrong-kind skin codes", "skin.test.mjs"],
    ["transfer.ts", "if (found.length !== 1 || found[0][1] !== 1) throw Error(ONE);", "if (found.length < 1) throw Error(ONE);", "import dispatches by prefix", "skin.test.mjs"],
    ["transfer.ts", "if (found.length !== 1 || found[0][1] !== 1) throw Error(ONE);", "if (found.length !== 1) throw Error(ONE);", "travels as a cdm1 code", "loop.test.mjs"],
    // a whole save (#124)
    ["backup.ts", "if (Object.keys(v).some((k) => !known.includes(k))) throw Error(NEWER);", "", "every field is one this version knows", "backup.test.mjs"],
    ["backup.ts", "if (typeof game.sound !== \"boolean\" || ", "if (", "every field is one this version knows", "backup.test.mjs"],
    ["backup.ts", "if (!same(portableLevel(level), level.loop || level.arrangement ? level : { ...level, song: level.song ?? 9 })) throw Error(NEWER);", "", "every field is one this version knows", "backup.test.mjs"],
    ["backup.ts", "if (!same(readGame, game) || !same(readSkinStore, skins)) throw Error(DAMAGED);", "", "every field is one this version knows", "backup.test.mjs"],
    ["backup.ts", "const checked = checkBackup({ v: 1, ...backup }, trailCount);\n  // each part", "const checked = backup;\n  // each part", "the writer checks the whole save itself", "backup.test.mjs"],
    ["backup.ts", "if (parts.some(([key, value]) => storage.getItem(key) !== value))", "if (false)", "any failed write or readback", "backup.test.mjs"],
    ["backup.ts", "        else storage.setItem(key, before[i]!);", "", "any failed write or readback", "backup.test.mjs"],
    ["backup.ts", "    else storage.setItem(IMPORT, marker);", "    else storage.removeItem(IMPORT);", "puts an earlier marker back", "backup.test.mjs"],
    ["backup.ts", "  } catch (cause) {\n    throw Error(\n      \"The save was copied in", "  } catch (cause) {\n    if (cause) return;\n    throw Error(\n      \"The save was copied in", "done marker failing", "backup.test.mjs"],
    ["transfer.ts", "if (text.length > MAX_SAVE_TEXT) throw Error(\"This code is too large.\");", "", "past the whole-save ceiling", "backup.test.mjs"],
    ["transfer.ts", "if (kind !== \"save\" && text.length > MAX_CODE)", "if (false)", "past the whole-save ceiling", "backup.test.mjs"],
    // loops in a whole save (#121)
    ["backup.ts", "for (const entry of loops.loops) fields(fields(entry, [\"id\", \"loop\"], [\"id\", \"loop\"]).loop, LOOP_FIELDS, LOOP_FIELDS);", "", "loop field this version does not know", "backup.test.mjs"],
    ["backup.ts", "    [LOOPS, checked.loops ? JSON.stringify(checked.loops) : null, \"loops\"],\n", "", "replaces this device's loops", "backup.test.mjs"],
    ["backup.ts", "if (value === null) storage.removeItem(key);\n      else storage.setItem(key, value);", "if (value !== null) storage.setItem(key, value);", "replaces this device's loops", "backup.test.mjs"],
    ["loop-schema.ts", "v.every((x, i) => i === 0 || (x as number) > (v[i - 1] as number))", "true", "exactly its eight fields", "loop.test.mjs"],
    ["loop.ts", "if (!int(s.next, 1, MAX_ID)) throw Error(\"Invalid loops\");", "", "refuses rather than drop", "loop.test.mjs"],
    ["loop.ts", "if (storage.getItem(LOOPS) !== raw) throw Error", "if (false) throw Error", "refuses rather than drop", "loop.test.mjs"],
    ["loop.ts", "await unpackCode(code, PREFIX, MAX_LOOP_BYTES, \"loop\")", "await unpackCode(code, PREFIX, MAX_LOOP_BYTES * 100, \"loop\")", "bounded and refuse", "loop.test.mjs"],
    // a loop as a custom level's song (#121 slice B)
    ["transfer.ts", "if (!fourth && (raw !== null && typeof raw === \"object\" && \"loop\" in raw) !== third) throw Error(\"Invalid level code.\");", "", "refused before anything could drop it", "loop-level.test.mjs"],
    ["transfer.ts", "(level.loop ? PREFIX3 : level.objects.some(usesNew) ? PREFIX2 : PREFIX)", "(level.objects.some(usesNew) ? PREFIX2 : PREFIX)", "travels as cdl3", "loop-level.test.mjs"],
    ["transfer.ts", "level.loop ? { loop: level.loop } : { song: level.song ?? 9 }", "{ song: level.song ?? 9 }", "one song source", "loop-level.test.mjs"],
    ["arrangement.ts", "duration(checked) > 240", "duration(checked) > 300", "four minutes", "song-arranger.test.mjs"],
    ["engine.ts", "    if (raw.song !== undefined) throw Error(\"Invalid level settings\");\n    // the loop's own bound", "    // the loop's own bound", "one song source", "loop-level.test.mjs"],
    ["engine.ts", "if (new TextEncoder().encode(JSON.stringify(raw.loop)).byteLength > MAX_LOOP_BYTES) throw", "if (false) throw", "bounded on what arrived", "loop-song.test.mjs"],
    ["backup.ts", "    if (plain(level) && \"loop\" in level) fields(level.loop, LOOP_FIELDS, LOOP_FIELDS);", "    ;", "field by field", "loop-song.test.mjs"],
    ["music.ts", "if (keyOf(i.music) !== key) this.sync(i.music, i.running, i.offset);\n            else this.enabled = false;", "this.enabled = false;", "no longer wanted", "loop-song.test.mjs"],
    ["music.ts", "    this.intent = { ...this.intent, running: false };\n", "", "hiding the page", "loop-song.test.mjs"],
    // (no mutant for the snapshot itself: composeLoop builds its whole graph before its first await,
    // so dropping the snapshot is equivalent today; it guards a future await before that point)
    ["music.ts", "(typeof music === \"number\" ? music : `l${JSON.stringify(music)}`)", "(typeof music === \"number\" ? music : \"loop\")", "renders as it was", "loop-song.test.mjs"],
    ["loop-player.ts", "  const root = loop.root + chordAt(bar);", "  const root = loop.root;", "1.0.96 player and this one", "loop-song.test.mjs"],
    ["music.ts", "for (let g = 0; g < total; g++)", "for (let g = 0; g < total - 8; g++)", "exactly what PLAY plays", "loop-song.test.mjs"],
    ["music.ts", "for (let g = 0; g < total; g++)", "for (let g = 0; g < total + 8; g++)", "exactly what PLAY plays", "loop-song.test.mjs"],
    // a resume the close rejects after unmount (lifecycle, WebKit)
    ["music.ts", "        if (!this.disposed) throw e;", "        throw e;", "rejected while the game lives", "music-lifetime.test.mjs"],
    ["music.ts", "        if (!this.disposed) throw e;", "        void e;", "rejected while the game lives", "music-lifetime.test.mjs"],
    // the cube's turn (#120)
    ["spin.ts", "return { angle: s.base + (t - s.takeoff) * TURN, side: s.side };", "return { angle: s.base - (t - s.takeoff) * TURN, side: s.side };", "turns forward", "spin.test.mjs"],
    ["spin.ts", "rest = Math.round(landed / QUARTER) * QUARTER,", "rest = 0,", "nearest flat side", "spin.test.mjs"],
    ["spin.ts", "Object.assign(s, { air: true, base: angle, takeoff: t, side });", "Object.assign(s, { air: true, base: 0, takeoff: t, side });", "turns on from where it rests", "spin.test.mjs"],
    ["spin.ts", "if (t < s.time || (state.mode !== \"square\" && state.mode !== \"pogo\")) {", "if (t < s.time) {", "another mode puts it upright", "spin.test.mjs"],
    ["spin.ts", "if (t < s.time || (state.mode", "if ((state.mode", "starts again starts upright", "spin.test.mjs"],
    ["spin.ts", "whole = Math.floor(rest / TURN) * TURN;", "whole = 0;", "a whole side in one turn", "spin.test.mjs"],
    ["spin.ts", "const k = ease(Math.min(1, (t - s.at) / SETTLE)),", "const k = 1,", "settles there in a tenth", "spin.test.mjs"],
    ["spin.ts", "    Object.assign(s, newSpin(), { time: t });\n    return { angle: 0, side: 0 };\n", "    Object.assign(s, newSpin(), { time: t });\n", "portal into the cube in mid-air", "spin.test.mjs"],
    ["spin.ts", "Object.assign(s, { air: true, base: angle, takeoff: t, side });", "Object.assign(s, { air: true, base: angle, takeoff: t, side: odd(s.rest) });", "carries the angle and the side", "spin.test.mjs"],
    ["spin.ts", "return { angle: s.from, side: s.side };", "return { angle: s.from, side: odd(s.rest) };", "carries the angle and the side", "spin.test.mjs"],
    ["render.ts", "(X(cx + (sx - cx) * turn.side) - x) / k,\n          ((Y(cy + (sy - cy) * turn.side) - y) / k) * flip,", "(X(cx) - x) / k,\n          ((Y(cy) - y) / k) * flip,", "swapped box", "spin.test.mjs"],
    ["render.ts", "      if (!reduced) {\n        let s = SPINS.get(state);", "      if (true) {\n        let s = SPINS.get(state);", "render turns the cube", "spin.test.mjs"],
    // teleports: one destination rule for the trigger and the ring (#139)
    ["engine.ts", "if (!b || o.x < b.x || (o.x === b.x && o.y < b.y)) best = i;", "if (!b || o.x < b.x) best = i;", "the destination", "teleport.test.mjs"],
    ["engine.ts", "    else if (!fx.fired[t] && o.x > from && o.x < s.x) fx.skipped[t] = 1;", "", "arriving is not crossing", "teleport.test.mjs"],
    ["engine.ts", "    if (o.touch) fx.inside[t] = intersects(playerPolygon(s), polygon(o)) ? 1 : 0;\n    else if", "    if (o.touch) continue;\n    else if", "landing inside a touch", "teleport.test.mjs"],
    ["engine.ts", "      if (fx.hopped || fx.jump) {", "      if (false) {", "crossed in one step", "teleport.test.mjs"],
    ["engine.ts", "  if (o.type === \"teleport-ring\" && !destination(s.level, o.target, s.fx?.groups)) return false;\n", "", "nowhere to go", "teleport.test.mjs"],
    ["engine.ts", "    if (o.x < area.left || o.x > area.right || o.y < 0 || o.y > area.top) continue;\n", "", "outside the trail is no landing spot", "teleport.test.mjs"],
    ["engine.ts", "o.x > area.right || o.y < 0 ||", "o.x > area.right || o.y < area.bottom ||", "outside the trail is no landing spot", "teleport.test.mjs"],
    // the three-sided outline (#139)
    ["render.ts", "                        ? [[bl, tl, tr, br]] // left, top and right, the bottom open (#139)", "                        ? [[tl, tr, br]] // left, top and right, the bottom open (#139)", "a variant strokes only", "edges.test.mjs"],
    ["engine.ts", "\"inner\", \"three\", \"none\"]", "\"inner\", \"none\"]", "six values", "edges.test.mjs"],
    // door lift comes from one continuous ground press (#139)
    ["engine.ts", "GRAVITY / 2 : GRAVITY", "GRAVITY / 3 : GRAVITY", "door starts with the square hop", "door.test.mjs"],
    ["run.ts", "if (this.state.doorLift) delete this.state.doorLift;", "", "release between ticks", "door.test.mjs"],
    // the upright framing eases across a turn (#138)
    ["framing.ts", "a + (b - a) * k", "b", "settles in about a third", "framing.test.mjs"],
    ["framing.ts", "const TAU = 0.06;", "const TAU = 0.3;", "settles in about a third", "framing.test.mjs"],
    // loops from 8 to 32 steps (#140)
    ["loop-schema.ts", "!LENGTHS.includes(notes.length)", "notes.length < 8", "8, 16, 24 or 32", "loop-length.test.mjs"],
    ["loop-schema.ts", "const step = (s: unknown) => int(s, 0, notes.length - 1);", "const step = (s: unknown) => int(s, 0, 31);", "8, 16, 24 or 32", "loop-length.test.mjs"],
    ["loop.ts", "notes: Array.from({ length }, (_, s) => loop.notes[s] ?? []),", "notes: Array.from({ length }, () => []),", "growing appends", "loop-length.test.mjs"],
    ["loop.ts", "|| DRUMS.some((d) => loop[d].some((s) => s >= length));", ";", "growing appends", "loop-length.test.mjs"],
    ["music.ts", "Math.max(BARS * 8, (64 * steps) / gcd(64, steps))", "BARS * 8", "whole passes", "loop-length.test.mjs"],
    ["loop-player.ts", "    if (this.step >= this.loop().notes.length) this.step = 0;", "    if (this.step >= 8) this.step = 0;", "a 16 step loop", "loop-song.test.mjs"],
    ["loop-player.ts", "  if (step % 8 === 0) play.pad(t, root, loop.drop);", "  if (step === 0) play.pad(t, root, loop.drop);", "every bar of 8", "loop-length.test.mjs"],
    // the live loop player's races (#121)
    ["loop-player.ts", "    while (this.next < c.currentTime) this.advance();\n", "", "long gap", "loop-player.test.mjs"],
    ["loop-player.ts", "for (const s of [this.session, this.preview]) if (s)", "for (const s of [this.session]) if (s)", "tapped cell is cut", "loop-player.test.mjs"],
    ["loop-player.ts", "if (token !== this.token) return; // a STOP or a new PLAY", "if (false) return; // a STOP or a new PLAY", "wakes after a STOP", "loop-player.test.mjs"],
    ["loop-player.ts", "if (token !== this.token) return; // stopped while waking", "if (false) return; // stopped while waking", "while sound is waking", "loop-player.test.mjs"],
    // the shared song voices (#121): each kind of change must move the frozen graph
    ["voices.ts", "seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;", "seed = (Math.imul(seed, 1664525) + 1013904225) >>> 0;", "same graph, schedule and noise", "compose-graph.test.mjs"],
    ["voices.ts", "g.gain.exponentialRampToValueAtTime(amplitude, t + 0.008);", "g.gain.exponentialRampToValueAtTime(amplitude, t + 0.009);", "same graph, schedule and noise", "compose-graph.test.mjs"],
    ["voices.ts", "depth.gain.value = drop ? 160 : 40;", "depth.gain.value = drop ? 161 : 40;", "same graph, schedule and noise", "compose-graph.test.mjs"],
    ["voices.ts", "    out.connect(echo);\n", "", "same graph, schedule and noise", "compose-graph.test.mjs"],
    ["voices.ts", "depth.gain.setValueAtTime(0, at + beat);", "lfo.stop(at + beat);", "same graph, schedule and noise", "compose-graph.test.mjs"],
    ["music.ts", "kick(t + 2.75 * BEAT, !drop);", "kick(t + 2.75 * BEAT, drop);", "same graph, schedule and noise", "compose-graph.test.mjs"],
    ["render.ts", "if (state.mode === \"square\" && skin) {", "if (skin) {", "a skin draws in square mode only", "skin.test.mjs"],
    ["skin.ts", "bottom = s.gravity > 0 ? s.y + SIZE - h : s.y;", "bottom = s.gravity > 0 ? s.y + SIZE - h : s.y + (1 - h) / 2;", "anchors feet", "skin.test.mjs"],
    ["skin.ts", "bottom = s.gravity > 0 ? s.y + SIZE - h : s.y;", "bottom = s.gravity > 0 ? s.y + SIZE - 1 + (1 - h) / 2 : s.y;", "anchors feet", "skin.test.mjs"],
    ["skin.ts", "Math.min(center, s.wall - w / 2)", "Math.min(center, s.wall - 0.5)", "anchors feet", "skin.test.mjs"],
    ["engine.ts", "SIZE = 0.64,", "SIZE = 0.7,", "a skin never changes the body", "skin.test.mjs"],
    // Width and height, touch triggers, multi touch rings and cdl2 (#117,
    // docs/width-height-touch-multi.md): each rule's own test catches its broken control.
    ["engine.ts", "lift = centred(o) ? 0 : ((ky - 1) * h) / 2;", "lift = ((ky - 1) * h) / 2;", "rule 1:", "width-height-touch-multi.test.mjs"],
    ["engine.ts", "x: cx - w / 2, y: cy - h / 2,", "x: Math.round((cx - w / 2) * 20) / 20, y: Math.round((cy - h / 2) * 20) / 20,", "rule 2:", "width-height-touch-multi.test.mjs"],
    ["engine.ts", 'if (["left", "right", "up", "down"].includes(action)) {\n    o.x', "if (true) {\n    o.x", "rule 2:", "width-height-touch-multi.test.mjs"],
    ["engine.ts", "if (scale === 1) return rest;", "", "rule 2:", "width-height-touch-multi.test.mjs"],
    ["engine.ts", "(o.scaleX === 1 && o.scaleY === 1))", "false)", "rule 1b", "width-height-touch-multi.test.mjs"],
    ["engine.ts", "(TRIGGERS.includes(o.type) && o.touch)", "TRIGGERS.includes(o.type)", "rule 1b", "width-height-touch-multi.test.mjs"],
    ["engine.ts", "c = Math.cos(a),\n    n = Math.sin(a),", "c = 1,\n    n = 0,", "rule 1d", "width-height-touch-multi.test.mjs"],
    ["engine.ts", "rx = 0.6 * o.scaleX!,", "rx = 0.6 * o.scaleY!,", "rule 1d", "width-height-touch-multi.test.mjs"],
    ["engine.ts", "return !o.multi || (o.dash === true && inReach(s, o));", "return !o.multi || (o.dash === true && false);", "rule 5", "width-height-touch-multi.test.mjs"],
    // a MULTI TOUCH tap ring fires on every fresh tap in its reach; a dash orb still waits to be left
    ["engine.ts", "return !o.multi || (o.dash === true && inReach(s, o));", "return !o.multi || inReach(s, o);", "rule 5", "width-height-touch-multi.test.mjs"],
    ["engine.ts", "return !o.multi || (o.dash === true && inReach(s, o));", "return !o.multi;", "rule 5", "width-height-touch-multi.test.mjs"],
    ["engine.ts", "entered = touching && !fx.inside[t];", "entered = touching;", "rule 4:", "width-height-touch-multi.test.mjs"],
    ["engine.ts", "if (!entered || (fx.fired[t] && !o.multi)) continue;", "if (!entered) continue;", "rule 4:", "width-height-touch-multi.test.mjs"],
    ["transfer.ts", ": level.objects.some(usesNew) ? PREFIX2 : PREFIX)", ": PREFIX)", "rule 6", "width-height-touch-multi.test.mjs"],
    ["transfer.ts", "if (level.objects.some(usesNew) !== second)", "if (false)", "rule 6", "width-height-touch-multi.test.mjs"],
    ["gesture.ts", "scaleY: axis(p.ky0)", "scaleY: axis(p.kx0)", "one factor", "gesture.test.mjs"],
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
