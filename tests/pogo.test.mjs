import { test } from "node:test";
import assert from "node:assert/strict";
import { inflateRawSync } from "node:zlib";
import {
  LEGACY_TYPES,
  PORTALS,
  TYPES,
  SOFT,
  createState,
  object,
  step,
  validateLevel,
} from "../src/engine.ts";
import { LEVELS } from "../src/levels.ts";
import { COURSES } from "../src/courses.ts";
import { readSave } from "../src/library.ts";
import { decodeLevel, encodeLevel, levelLink } from "../src/transfer.ts";
import { labelOf } from "../src/types.ts";

// The stored id "jumper" became "pogo" (#33). Old saves, codes and links carry the old id, so
// every read path maps it; every write path emits the new one.
const legacyPiece = { ...object("pogo", 5, 1), type: "jumper" };
const legacyLevel = () => ({
  name: "Old pogo",
  length: 40,
  objects: [legacyPiece, object("outline", 10, 3)],
});
const rawCode = (level) =>
  "cdl1.0" + Buffer.from(JSON.stringify(level)).toString("base64url");
const payloadOf = (code) => {
  const flag = code[5],
    bytes = Buffer.from(code.slice(6), "base64url");
  return (flag === "1" ? inflateRawSync(bytes) : bytes).toString("utf8");
};

test("the stored id is pogo everywhere, and jumper is only a legacy alias", () => {
  assert.equal(LEGACY_TYPES.jumper, "pogo");
  assert.ok(PORTALS.includes("pogo") && SOFT.includes("pogo"));
  assert.ok(!TYPES.includes("jumper"));
  assert.ok(!JSON.stringify(LEVELS).includes("jumper"));
  assert.ok(!JSON.stringify(COURSES).includes("jumper"));
  assert.ok(JSON.stringify(LEVELS).includes('"pogo"'));
  assert.equal(labelOf("pogo"), "POGO");
  assert.equal(labelOf("w-block"), "WALL PASS");
});

test("validateLevel maps a legacy jumper to pogo before geometry, without touching its input", () => {
  const source = legacyLevel();
  const level = validateLevel(source);
  assert.deepEqual(
    level.objects.map((o) => o.type),
    ["pogo", "outline"],
  );
  assert.equal(source.objects[0].type, "jumper", "input is not rewritten");
  assert.deepEqual(level, { ...source, objects: [object("pogo", 5, 1), object("outline", 10, 3)] });
  // A portal is 2.5 high. The legacy id must be measured as a portal, so it hits the ceiling
  // exactly where a pogo piece would; treated as an unknown 1x1 shape it would slip through.
  const tall = { ...legacyLevel(), height: 7, objects: [{ ...legacyPiece, y: 5 }] };
  assert.throws(() => validateLevel(tall), /above ceiling/);
  assert.throws(
    () => validateLevel({ ...tall, objects: [object("pogo", 5, 5)] }),
    /above ceiling/,
  );
  assert.doesNotThrow(() => validateLevel({ ...tall, objects: [{ ...legacyPiece, y: 4.5 }] }));
  // Only the listed alias is accepted; other unknown ids still fail closed.
  assert.throws(() => validateLevel({ ...legacyLevel(), objects: [{ ...legacyPiece, type: "hopper" }] }));
});

test("a legacy portal switches the runner into pogo mode", () => {
  const s = createState(validateLevel({ ...legacyLevel(), objects: [{ ...legacyPiece, x: 3, y: 2 }] }));
  s.x = 2.5;
  s.y = 3;
  s.grounded = false;
  step(s, false);
  assert.equal(s.mode, "pogo");
});

test("readSave loads a jumper save and writes it back with pogo, draft and library alike", () => {
  const draft = legacyLevel();
  const raw = JSON.stringify({ version: 1, best: { 0: 100 }, sound: true, draft });
  const save = readSave(raw, 9);
  assert.equal(save.draft.objects[0].type, "pogo");
  assert.equal(save.customLevels[0].level.objects[0].type, "pogo");
  assert.ok(!JSON.stringify(save).includes("jumper"));
  assert.deepEqual(save.best, { 0: 100 });
  // A library save: the active draft AND every stored level map.
  const library = JSON.stringify({
    version: 1,
    best: {},
    sound: false,
    draft: { ...draft, name: "Active" },
    customLevels: [
      { id: 1, level: { ...draft, name: "Active" } },
      { id: 2, level: { ...draft, name: "Shelved" } },
    ],
    activeLevel: 1,
  });
  const loaded = readSave(library, 9);
  assert.deepEqual(
    loaded.customLevels.map((e) => e.level.objects[0].type),
    ["pogo", "pogo"],
  );
  assert.ok(!JSON.stringify(loaded).includes("jumper"));
  // The migrated save reloads as itself.
  assert.deepEqual(readSave(JSON.stringify(loaded), 9), loaded);
});

test("share codes and links with the jumper id decode to pogo; new codes never carry jumper", async () => {
  const old = legacyLevel();
  const expected = {
    ...old,
    song: 9,
    objects: [object("pogo", 5, 1), object("outline", 10, 3)],
  };
  const code = rawCode(old);
  assert.ok(payloadOf(code).includes('"jumper"'), "fixture is a legacy code");
  assert.deepEqual(await decodeLevel(code), expected);
  assert.deepEqual(
    await decodeLevel(levelLink(code, "https://clonedash.example/")),
    expected,
  );
  const fresh = await encodeLevel(old);
  assert.ok(!payloadOf(fresh).includes("jumper"));
  assert.ok(payloadOf(fresh).includes('"pogo"'));
  assert.deepEqual(await decodeLevel(fresh), expected);
});
