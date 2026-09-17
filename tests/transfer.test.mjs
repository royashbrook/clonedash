import { test } from "node:test";
import assert from "node:assert/strict";
import { deflateRawSync } from "node:zlib";
import {
  encodeLevel,
  decodeLevel,
  levelLink,
  appendLevel,
  importLevel,
  MAX_CODE,
  MAX_LEVEL_BYTES,
} from "../src/transfer.ts";
import { TYPES, object } from "../src/engine.ts";
import { readSave, newLevel, SAVE } from "../src/library.ts";

const level = () => ({
  name: "Sky × 地 🌙",
  length: 200,
  height: 40,
  song: 108,
  objects: TYPES.map((type, i) => ({
    ...object(type, 5 + i * 2, 2.05),
    rotation: [0, 90, 180, 270][i % 4],
    flipX: i % 2 === 0,
    flipY: i % 3 === 0,
  })),
});
const raw = (value) =>
  "cdl1.0" + Buffer.from(JSON.stringify(value)).toString("base64url");
const full = () => {
  const s = readSave(null, 9);
  while (s.customLevels.length < 100) newLevel(s);
  return s;
};

test("portable code/link round-trip every object, transform, height, song and background", async () => {
  const original = level();
  original.objects.push({ ...object("grid", 5.05, 38), layer: "background" });
  original.note = "A tall trail";
  original.color = "#abcdef";
  const code = await encodeLevel(original);
  assert.match(code, /^cdl1\.1/);
  assert.deepEqual(await decodeLevel(code), original);
  const link = levelLink(code, "https://clonedash.example/?level=2#old");
  assert.equal(new URL(link).search, "");
  assert.deepEqual(await decodeLevel(link), original);
  assert.deepEqual(await decodeLevel(raw(original)), original);
});

test("all 600 pieces fit; export strips arbitrary properties and never includes progress", async () => {
  const original = level();
  original.objects = Array.from({ length: 600 }, (_, i) => ({
    ...object("grid", 3 + (i % 190), Math.floor(i / 190)),
    privateValue: "secret",
  }));
  const code = await encodeLevel({
    ...original,
    best: { 0: 100 },
    customLevels: [],
    sound: true,
  });
  assert.ok(code.length < MAX_CODE);
  const decoded = await decodeLevel(code);
  assert.equal(decoded.objects.length, 600);
  assert.equal(decoded.best, undefined);
  assert.equal(decoded.sound, undefined);
  assert.equal(decoded.objects[0].privateValue, undefined);
});

test("legacy implicit height remains implicit so tall old portals still round-trip", async () => {
  const old = {
    name: "Old portal",
    length: 40,
    objects: [object("plane", 5, 6)],
  };
  const decoded = await decodeLevel(await encodeLevel(old));
  assert.deepEqual(decoded, { ...old, song: 9 });
  const imported = appendLevel(readSave(null, 9), decoded);
  assert.doesNotThrow(() => readSave(JSON.stringify(imported), 9));
});

test("raw fallback works with missing compression and older partial implementations", async (t) => {
  const original = level();
  for (const value of [
    undefined,
    class {
      constructor() {
        throw new TypeError("Unsupported format");
      }
    },
  ]) {
    t.mock.method(
      globalThis,
      "CompressionStream",
      value === undefined
        ? () => {
            throw new TypeError();
          }
        : value,
    );
    const code = await encodeLevel(original);
    assert.match(code, /^cdl1\.0/);
    assert.deepEqual(await decodeLevel(code), original);
    t.mock.restoreAll();
  }
});

test("rejects malformed, unknown-version, oversized and non-canonical codes", async () => {
  for (const code of [
    "",
    "cdl2.0AAAA",
    "cdl1.2AA",
    "cdl1.0AA=",
    "cdl1.0A",
    "cdl1.0AB",
    "cdl1.1AAAA",
    "cdl1.0__8",
    "x".repeat(MAX_CODE + 1),
    "https://example.com/#level=a&level=b",
  ]) {
    await assert.rejects(() => decodeLevel(code), undefined, code.slice(0, 40));
  }
});

test("external schema rejects every unsafe field without relaxing the engine validator", async () => {
  const changes = [
    (l) => (l.name = 1),
    (l) => (l.name = "x".repeat(41)),
    (l) => (l.length = 201),
    (l) => (l.height = null),
    (l) => (l.height = 6),
    (l) => (l.song = 109),
    (l) => (l.song = "2"),
    (l) => (l.note = {}),
    (l) => (l.color = "url(evil)"),
    (l) => (l.objects = Array(601).fill(object("grid", 5))),
    (l) => (l.objects[0].type = "script"),
    (l) => (l.objects[0].x = 2),
    (l) => (l.objects[0].y = 40),
    (l) => (l.objects[0].rotation = 45),
    (l) => (l.objects[0].flipX = 1),
    (l) => (l.objects[0].layer = "foreground"),
    (l) => (l.objects = [{ ...object("spike", 5), layer: "background" }]),
  ];
  for (const change of changes) {
    const candidate = level();
    change(candidate);
    await assert.rejects(() => decodeLevel(raw(candidate)));
  }
});

test("compressed bomb is refused at the inflated-byte bound", async () => {
  const compressed = deflateRawSync(Buffer.alloc(MAX_LEVEL_BYTES * 32, 32));
  assert.ok(compressed.length < MAX_CODE);
  await assert.rejects(
    () => decodeLevel("cdl1.1" + compressed.toString("base64url")),
    /too large/,
  );
});

test("inflation stops and cancels before collecting the full oversized stream", async (t) => {
  let pulls = 0,
    cancelled = false;
  t.mock.method(
    globalThis,
    "DecompressionStream",
    class {
      constructor() {
        return {
          writable: new WritableStream(),
          readable: new ReadableStream({
            pull(controller) {
              pulls++;
              controller.enqueue(new Uint8Array(MAX_LEVEL_BYTES / 2));
              if (pulls === 100) controller.close();
            },
            cancel() {
              cancelled = true;
            },
          }),
        };
      }
    },
  );
  await assert.rejects(() => decodeLevel("cdl1.1AA"), /too large/);
  assert.ok(pulls < 6, `consumed ${pulls} chunks before refusing`);
  assert.equal(cancelled, true);
});

test("stalled decoder times out and cancels its reader", async (t) => {
  let cancelled = false;
  t.mock.timers.enable({ apis: ["setTimeout"] });
  t.mock.method(
    globalThis,
    "DecompressionStream",
    class {
      constructor() {
        return {
          writable: new WritableStream(),
          readable: new ReadableStream({
            cancel() {
              cancelled = true;
            },
          }),
        };
      }
    },
  );
  const decoding = decodeLevel("cdl1.1AA");
  const rejected = assert.rejects(decoding, /timed out/);
  t.mock.timers.tick(5000);
  await rejected;
  assert.equal(cancelled, true);
});

test("import appends independently without changing draft, active level, progress or sound", () => {
  const save = readSave(null, 9);
  save.best = { 0: 100, 4: 27 };
  save.sound = true;
  newLevel(save);
  const before = structuredClone(save),
    incoming = level();
  const next = appendLevel(save, incoming);
  assert.deepEqual(save, before);
  assert.deepEqual(
    { ...next, customLevels: next.customLevels.slice(0, -1) },
    before,
  );
  assert.deepEqual(next.customLevels.at(-1), { id: 3, level: incoming });
  next.customLevels.at(-1).level.objects[0].x = 99;
  next.draft.name = "Changed";
  assert.notEqual(incoming.objects[0].x, 99);
  assert.deepEqual(save, before);
  const packed = full(),
    packedBefore = structuredClone(packed);
  assert.throws(() => appendLevel(packed, incoming), /full/);
  assert.deepEqual(packed, packedBefore);
});

test("confirmation rereads storage, and corrupt, full, refused or throwing storage never replaces old data", () => {
  const stale = readSave(null, 9),
    fresh = structuredClone(stale);
  newLevel(fresh);
  let value = JSON.stringify(fresh);
  const storage = {
    getItem: (key) => {
      assert.equal(key, SAVE);
      return value;
    },
    setItem: (key, raw) => {
      assert.equal(key, SAVE);
      value = raw;
    },
  };
  const next = importLevel(storage, stale, level(), 9);
  assert.equal(next.customLevels.length, 3);
  assert.equal(next.activeLevel, 2);
  assert.deepEqual(next.customLevels.slice(0, 2), fresh.customLevels);
  for (const saved of ['{"broken":true}', JSON.stringify(full())]) {
    value = saved;
    assert.throws(() => importLevel(storage, stale, level(), 9));
    assert.equal(value, saved);
  }
  value = JSON.stringify(stale);
  const before = value;
  for (const setItem of [
    () => {},
    () => {
      throw Error("quota");
    },
  ]) {
    assert.throws(() =>
      importLevel({ ...storage, setItem }, stale, level(), 9),
    );
    assert.equal(value, before);
  }
});
