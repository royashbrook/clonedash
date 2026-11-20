import { test } from "node:test";
import assert from "node:assert/strict";
import { deflateRawSync } from "node:zlib";
import {
  SKINS,
  MAX_SKIN_BYTES,
  validateSkin,
  readSkins,
  emptyStore,
  addSkin,
  saveSkin,
  deleteSkin,
  wearSkin,
  wornSkin,
  commitSkins,
  isBlank,
  fitSkin,
  skinBox,
  hitbox,
  toCells,
  fromCells,
  resizeCells,
  dropsPixels,
  fillCells,
  lineCells,
  cellAt,
  encodeSkin,
  decodeSkin,
  skinLink,
} from "../src/skin.ts";
import { codeKind, decodeLevel, encodeLevel, MAX_CODE } from "../src/transfer.ts";
import { SAVE } from "../src/library.ts";
import { createState, SIZE, STEP } from "../src/engine.ts";
import { LEVELS } from "../src/levels.ts";
import { Run } from "../src/run.ts";
import { AVATAR } from "../src/render.ts";
import { canvasLog, player } from "./canvas-log.mjs";

// docs/skins.md is the contract these pin.
const skin = (over = {}) => ({
  name: "Robot",
  width: 8,
  height: 8,
  palette: ["#9aff6b", "#101825"],
  pixels: "1".repeat(32) + "2".repeat(32),
  ...over,
});
const sized = (width, height) =>
  skin({ width, height, palette: ["#ff5c7a"], pixels: "1".repeat(width * height) });
const raw = (value) => "cds1.0" + Buffer.from(JSON.stringify(value)).toString("base64url");
function memory(initial = {}) {
  const values = { ...initial },
    writes = [];
  return {
    values,
    writes,
    getItem: (key) => (key in values ? values[key] : null),
    setItem: (key, value) => {
      writes.push(key);
      values[key] = String(value);
    },
  };
}

test("the schema: every bound and form is refused at the one validator, and it rebuilds the five fields", () => {
  assert.deepEqual(validateSkin({ ...skin(), id: 4, selected: true, html: "<b>" }), skin());
  for (const [w, h] of [[4, 4], [32, 32], [4, 100], [100, 4], [100, 100], [16, 8]])
    assert.doesNotThrow(() => validateSkin(sized(w, h)), `${w}x${h}`);
  const bad = [
    null,
    [],
    "skin",
    skin({ name: 1 }),
    skin({ name: "x".repeat(41) }),
    sized(3, 8),
    sized(8, 3),
    sized(101, 8),
    sized(8, 101),
    skin({ width: 8.5 }),
    skin({ width: NaN }),
    skin({ height: Infinity }),
    skin({ width: "8" }),
    skin({ palette: "#ffffff" }),
    skin({ palette: ["#FFFFFF"] }),
    skin({ palette: ["red"] }),
    skin({ palette: ["url(evil)"] }),
    skin({ palette: ["#fff"] }),
    skin({ palette: ["#9aff6b", "#9aff6b"] }),
    skin({ palette: Array.from({ length: 17 }, (_, i) => `#0000${(i + 16).toString(16)}`) }),
    skin({ pixels: "1".repeat(63) }),
    skin({ pixels: "1".repeat(65) }),
    skin({ pixels: [..."1".repeat(64)] }),
    skin({ pixels: "3".repeat(64) }), // index past the palette
    skin({ pixels: "h".repeat(64) }),
    skin({ pixels: "x".repeat(64) }),
  ];
  for (const candidate of bad)
    assert.throws(() => validateSkin(candidate), undefined, JSON.stringify(candidate)?.slice(0, 60));
  assert.ok(isBlank(skin({ pixels: "0".repeat(64) })));
  assert.ok(!isBlank(skin()));
});

test("the store: 100 skins, ids never reused, the worn skin must exist and have a pixel", () => {
  const store = emptyStore();
  const a = addSkin(store, skin()),
    b = addSkin(store, skin({ name: "B" }));
  assert.deepEqual([a, b], [1, 2]);
  deleteSkin(store, b);
  assert.equal(addSkin(store, skin({ name: "C" })), 3, "a freed id is never handed out again");
  wearSkin(store, 3);
  assert.equal(wornSkin(store).name, "C");
  deleteSkin(store, 3);
  assert.equal(store.selected, undefined, "deleting the worn skin goes back to the default cube");
  assert.equal(wornSkin(store), null);
  const blank = addSkin(store, skin({ name: "Blank", pixels: "0".repeat(64) }));
  assert.throws(() => wearSkin(store, blank), /at least one pixel/);
  wearSkin(store, a);
  assert.throws(() => saveSkin(store, a, skin({ pixels: "0".repeat(64) })), /wearing/);
  assert.equal(saveSkin(store, 999, skin({ name: "Gone elsewhere" })), 5, "a deleted id saves as a new skin");
  while (store.skins.length < 100) addSkin(store, skin());
  assert.throws(() => addSkin(store, skin()), /100 skins/);
  assert.deepEqual(readSkins(JSON.stringify(store)), store);
  for (const broken of [
    "[]",
    "{}",
    JSON.stringify({ version: 2, next: 1, skins: [] }),
    JSON.stringify({ version: 1, next: 0, skins: [] }),
    JSON.stringify({ version: 1, next: 1.5, skins: [] }),
    JSON.stringify({ version: 1, next: 2, skins: [{ id: 1, skin: sized(101, 4) }] }),
    JSON.stringify({ version: 1, next: 2, skins: [{ id: 2, skin: skin() }] }),
    JSON.stringify({ version: 1, next: 3, skins: [{ id: 1, skin: skin() }, { id: 1, skin: skin() }] }),
    JSON.stringify({ version: 1, next: 2, skins: [{ id: 1, skin: skin() }], selected: 5 }),
    JSON.stringify({ version: 1, next: 2, skins: [{ id: 1, skin: skin({ pixels: "0".repeat(64) }) }], selected: 1 }),
    JSON.stringify({ version: 1, next: 102, skins: Array.from({ length: 101 }, (_, i) => ({ id: i + 1, skin: skin() })) }),
  ])
    assert.throws(() => readSkins(broken), undefined, broken.slice(0, 80));
});

test("stale-tab preservation: every skin write re-reads its own key and takes the new id from it, and the level save is never touched", () => {
  const levelSave = '{"version":1,"untouched":true}';
  const storage = memory({ [SAVE]: levelSave });
  // two tabs opened before either saved, both holding an empty store in memory, then saving one
  // after the other (sequential, not overlapping: web storage has no lock)
  const tabA = commitSkins(storage, (s) => addSkin(s, skin({ name: "From A" })));
  const tabB = commitSkins(storage, (s) => addSkin(s, skin({ name: "From B" })));
  assert.deepEqual(tabA.skins.map((e) => e.skin.name), ["From A"]);
  assert.deepEqual(tabB.skins.map((e) => e.skin.name), ["From A", "From B"]);
  assert.deepEqual(tabB.skins.map((e) => e.id), [1, 2], "B's new id comes from the latest stored record");
  assert.deepEqual(readSkins(storage.getItem(SKINS)), tabB);
  // tab A, still showing only its own skin, renames it: B's skin survives
  commitSkins(storage, (s) => saveSkin(s, 1, skin({ name: "Renamed in A" })));
  assert.deepEqual(readSkins(storage.getItem(SKINS)).skins.map((e) => e.skin.name), ["Renamed in A", "From B"]);
  commitSkins(storage, (s) => wearSkin(s, 2));
  commitSkins(storage, (s) => deleteSkin(s, 1));
  assert.deepEqual(readSkins(storage.getItem(SKINS)).skins.map((e) => e.id), [2]);
  assert.equal(storage.getItem(SAVE), levelSave);
  assert.ok(storage.writes.every((key) => key === SKINS));
});

test("refused, unconfirmed and invalid writes leave every stored byte and report failure", () => {
  const good = JSON.stringify({ version: 1, next: 2, skins: [{ id: 1, skin: skin() }] });
  for (const stored of ['{"broken":', '{"version":1,"next":1,"skins":"x"}', JSON.stringify({ version: 1, next: 2, skins: [{ id: 1, skin: sized(101, 4) }] })]) {
    const storage = memory({ [SKINS]: stored });
    assert.throws(() => commitSkins(storage, (s) => addSkin(s, skin())), /could not be read/);
    assert.equal(storage.getItem(SKINS), stored, "invalid stored data is never replaced by fallback data");
    assert.deepEqual(storage.writes, []);
  }
  const storage = memory({ [SKINS]: good });
  assert.throws(() => commitSkins(storage, (s) => addSkin(s, sized(4, 101))));
  assert.throws(() => commitSkins(storage, (s) => wearSkin(s, 7)));
  assert.equal(storage.getItem(SKINS), good);
  assert.throws(
    () => commitSkins({ ...storage, setItem: () => { throw Error("quota"); } }, (s) => addSkin(s, skin())),
    /full or blocked/,
  );
  assert.throws(() => commitSkins({ ...storage, setItem: () => {} }, (s) => addSkin(s, skin())), /could not confirm/);
  assert.equal(storage.getItem(SKINS), good);
});

test("cds1 codes, links and the raw form round-trip; the export carries the five skin fields only", async (t) => {
  const original = skin({ name: "Sky × 地 🌙", width: 16, height: 8, pixels: "12".repeat(64) });
  const code = await encodeSkin({ ...original, id: 3, selected: 3, customLevels: [], best: { 0: 100 } });
  assert.match(code, /^cds1\.1/);
  assert.deepEqual(await decodeSkin(code), original);
  assert.deepEqual(Object.keys(await decodeSkin(code)), ["name", "width", "height", "palette", "pixels"]);
  const link = skinLink(code, "https://clonedash.example/?level=2#level=old");
  assert.equal(new URL(link).search, "");
  assert.equal(new URL(link).hash, `#skin=${code}`);
  assert.deepEqual(await decodeSkin(link), original);
  assert.deepEqual(await decodeSkin(raw(original)), original);
  // raw fallback when the compression API is missing or refuses deflate-raw
  for (const value of [
    () => {
      throw new TypeError();
    },
    class {
      constructor() {
        throw new TypeError("Unsupported format");
      }
    },
  ]) {
    t.mock.method(globalThis, "CompressionStream", value);
    const plain = await encodeSkin(original);
    assert.match(plain, /^cds1\.0/);
    assert.deepEqual(await decodeSkin(plain), original);
    t.mock.restoreAll();
  }
});

test("bad, oversized, ambiguous and wrong-kind skin codes are refused", async () => {
  const code = await encodeSkin(skin());
  const level = await encodeLevel({ name: "L", length: 40, objects: [] });
  for (const bad of [
    "",
    "cds2.0AAAA",
    "cds1.2AA",
    "cds1.0AA=",
    "cds1.0A",
    "cds1.0AB",
    "cds1.1AAAA",
    "cds1.0" + "A".repeat(11000),
    "x".repeat(MAX_CODE + 1),
    code + " ".repeat(MAX_CODE),
    level,
    `https://e.test/#level=${level}`,
    `https://e.test/#skin=${code}&skin=${code}`,
    `https://e.test/#skin=${code}&level=${level}`,
    raw(sized(101, 4)),
    raw("skin"),
  ])
    await assert.rejects(() => decodeSkin(bad), undefined, bad.slice(0, 40));
  // cdl1 is a level exactly as before: the level decoder refuses a skin, and a mixed link
  await assert.rejects(() => decodeLevel(code), /cdl1/);
  await assert.rejects(() => decodeLevel(`https://e.test/#level=${level}&skin=${code}`), /one level/);
  assert.equal((await decodeLevel(`https://e.test/#level=${level}`)).name, "L");
});

test("import dispatches by prefix or link parameter to the two decoders and refuses ambiguity", async () => {
  const code = await encodeSkin(skin()),
    level = await encodeLevel({ name: "L", length: 40, objects: [] });
  assert.equal(codeKind(code), "skin");
  assert.equal(codeKind(`  ${code}\n`), "skin");
  assert.equal(codeKind(level), "level");
  assert.equal(codeKind("cdl9.0bad"), "level", "anything else reads as a level and its decoder refuses it as before");
  assert.equal(codeKind(skinLink(code, "https://e.test/")), "skin");
  assert.equal(codeKind(`https://e.test/#level=${level}`), "level");
  for (const bad of [
    `https://e.test/#level=${level}&skin=${code}`,
    `https://e.test/#skin=a&skin=b`,
    `https://e.test/#level=a&level=b`,
    `https://e.test/#nothing=1`,
    "x".repeat(MAX_CODE + 1),
  ])
    assert.throws(() => codeKind(bad), undefined, bad.slice(0, 40));
});

test("skin inflation is bounded while reading, cancelled, has the deadline, and needs decompression support", async (t) => {
  const bomb = deflateRawSync(Buffer.alloc(MAX_SKIN_BYTES * 32, 32));
  await assert.rejects(() => decodeSkin("cds1.1" + bomb.toString("base64url")), /too large/);
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
              controller.enqueue(new Uint8Array(MAX_SKIN_BYTES / 2));
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
  await assert.rejects(() => decodeSkin("cds1.1AA"), /skin is too large/);
  assert.ok(pulls < 6, `consumed ${pulls} chunks before refusing`);
  assert.equal(cancelled, true);
  t.mock.restoreAll();
  cancelled = false;
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
  const decoding = decodeSkin("cds1.1AA");
  const rejected = assert.rejects(decoding, /Skin decoding timed out/);
  t.mock.timers.tick(5000);
  await rejected;
  assert.equal(cancelled, true);
  t.mock.restoreAll();
  t.mock.timers.reset();
  const compressed = await encodeSkin(skin());
  const native = globalThis.DecompressionStream;
  try {
    delete globalThis.DecompressionStream;
    await assert.rejects(() => decodeSkin(compressed), /Update your browser/);
  } finally {
    globalThis.DecompressionStream = native;
  }
  assert.deepEqual(await decodeSkin(raw(skin())), skin(), "a raw code still opens");
});

test("QR density: the level policy measured on a worst-case 32x32 noise skin", async () => {
  // the share sheet's policy (LevelTransfer.svelte): link at most 2000 characters and a QR of at
  // most version 15 at medium correction, else the complete code and file instead
  // loaded here, not at the top: the mutation runner copies this file outside node_modules
  const { default: QRCode } = await import("qrcode");
  const fits = (link) => {
    if (link.length > 2000) return { fits: false, version: null };
    const version = QRCode.create(link, { errorCorrectionLevel: "M" }).version;
    return { fits: version <= 15, version };
  };
  let seed = 107;
  const rand = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32;
  const palette = Array.from({ length: 16 }, (_, i) => `#${(0x123456 + i * 0x0b0a09).toString(16).padStart(6, "0").slice(-6)}`);
  const noise = {
    name: "🌙".repeat(20),
    width: 32,
    height: 32,
    palette,
    pixels: Array.from({ length: 1024 }, () => "0123456789abcdefg"[Math.floor(rand() * 17)]).join(""),
  };
  const address = "https://clonedash.royashbrook.com/";
  const worst = skinLink(await encodeSkin(noise), address);
  const small = skinLink(await encodeSkin(skin()), address);
  const busy16 = skinLink(
    await encodeSkin({ ...noise, name: "Busy", width: 16, height: 16, pixels: noise.pixels.slice(0, 256) }),
    address,
  );
  const measured = { worst: { length: worst.length, ...fits(worst) }, busy16: { length: busy16.length, ...fits(busy16) }, small: { length: small.length, ...fits(small) } };
  t_log(measured);
  assert.equal(measured.small.fits, true, "an 8x8 skin has a phone QR");
  assert.equal(measured.worst.fits, false, "a worst-case skin falls back to the code and file");
  assert.deepEqual(await decodeSkin(worst), noise, "and its complete code still round-trips");
});
const t_log = (value) => console.log(`# skin QR measurement ${JSON.stringify(value)}`);

test("the editor's pure helpers: resize keeps the top-left, fill, contiguous strokes, CSS-pixel cells", () => {
  const cells = toCells(skin());
  assert.deepEqual(fromCells("Robot", 8, 8, cells), skin());
  const grown = resizeCells(cells, 8, 8, 10, 4);
  assert.equal(grown.length, 40);
  assert.deepEqual(grown.slice(0, 8), cells.slice(0, 8));
  assert.deepEqual(grown.slice(8, 10), ["", ""]);
  assert.deepEqual(grown.slice(30, 38), cells.slice(24, 32));
  assert.equal(dropsPixels(cells, 8, 10, 4), true, "dropping rows of colour asks first");
  assert.equal(dropsPixels(resizeCells(cells, 8, 8, 8, 4), 8, 8, 4), false);
  assert.equal(dropsPixels(["", "", "", "#ffffff", ...Array(12).fill("")], 4, 3, 4), true);
  assert.equal(dropsPixels(Array(16).fill(""), 4, 4, 4), false);
  assert.throws(() => fromCells("x", 4, 5, Array.from({ length: 20 }, (_, i) => `#0000${(i + 16).toString(16)}`)), /16 colours/);
  // fill: the 4-connected region only
  const board = ["a", "a", "b", "a", "b", "b", "b", "a", "a"].map((c) => (c === "a" ? "" : "#ffffff"));
  assert.deepEqual(fillCells(board, 3, 3, 0, 0, "#ff0000").sort(), [0, 1, 3]);
  assert.deepEqual(fillCells(board, 3, 3, 0, 0, ""), []);
  // a fast drag between two samples paints every cell between, each once
  for (const [x0, y0, x1, y1] of [[0, 0, 31, 5], [31, 31, 0, 0], [3, 3, 3, 3], [0, 9, 4, 0]]) {
    const line = lineCells(x0, y0, x1, y1);
    assert.deepEqual(line[0], [x0, y0]);
    assert.deepEqual(line.at(-1), [x1, y1]);
    assert.equal(new Set(line.map(String)).size, line.length);
    for (let i = 1; i < line.length; i++)
      assert.ok(Math.abs(line[i][0] - line[i - 1][0]) <= 1 && Math.abs(line[i][1] - line[i - 1][1]) <= 1);
  }
  // cells come from CSS client coordinates and the grid's CSS box, whatever the DPR or scroll
  const box = { left: 20, top: -300, width: 240, height: 120 }; // scrolled 300px down the page
  assert.deepEqual(cellAt(20, -300, box, 16, 8), [0, 0]);
  assert.deepEqual(cellAt(259.9, -180.1, box, 16, 8), [15, 7]);
  assert.deepEqual(cellAt(20 + 15 * 3, -300 + 15 * 2, box, 16, 8), [3, 2]);
  assert.equal(cellAt(19, -250, box, 16, 8), null);
  assert.equal(cellAt(100, -180, box, 16, 8), null);
});

// ---- drawing ----

const art = (width, height) => ({ image: { tiny: `${width}x${height}` }, width, height });
const pose = (over = {}) => ({ ...createState(LEVELS[0]), mode: "square", gravity: -1, x: 9, y: 2, grounded: true, ...over });
const frame = (state, skinArt, extra = {}) =>
  canvasLog({ state, level: LEVELS[0], camera: 5, cameraY: 1, time: 0.2, reduced: false, ...(skinArt === undefined ? {} : { skin: skinArt }), ...extra });

test("a skin draws in square mode only: pogo, every other mode and no skin keep their exact commands", () => {
  for (const mode of ["square", "pogo", "wheel", "croissant", "angle", "plane"])
    for (const gravity of [-1, 1]) {
      const state = pose({ mode, gravity, grounded: false });
      const plain = frame(state).log;
      assert.deepEqual(frame(state, null).log, plain, `${mode}: a null skin is the default path`);
      if (mode !== "square") assert.deepEqual(frame(state, art(16, 8)).log, plain, `${mode} ignores a skin`);
      else assert.notDeepEqual(frame(state, art(16, 8)).log, plain);
    }
  const dead = pose({ status: "dead" });
  assert.deepEqual(frame(dead, art(8, 8)).log, frame(dead).log, "death draws the same burst");
});

test("a skin's drawn rectangle keeps its aspect, fits the one-block box, and anchors feet, head and W wall", () => {
  for (const [w, h] of [[8, 8], [16, 8], [8, 16], [4, 32], [32, 4], [5, 7]])
    for (const gravity of [-1, 1])
      for (const wall of [null, 9.5]) {
        const state = pose({ gravity, wall, x: wall === null ? 9 : 9.5 - SIZE });
        const { log, view } = frame(state, art(w, h));
        const X = (x) => (x - view.camera) * view.unit,
          Y = (y) => view.floor - (y - view.cameraY) * view.unit;
        const drawn = log.filter((c) => c[0] === "screen");
        assert.equal(drawn.length, 1, "one image per frame");
        const [, left, top, right, bottom] = drawn[0];
        const near = (a, b, what) => assert.ok(Math.abs(a - b) < 1e-6, `${w}x${h} g${gravity} wall${wall}: ${what} ${a} vs ${b}`);
        near(Math.max(right - left, bottom - top), AVATAR * view.unit, "the longer side is one block");
        near((right - left) / (bottom - top), w / h, "aspect kept");
        if (gravity < 0) near(bottom, Y(state.y), "feet on the body's bottom edge");
        else near(top, Y(state.y + SIZE), "head on the body's top edge");
        const fitted = fitSkin(w, h, AVATAR).w;
        if (wall !== null) assert.ok(right <= X(wall) + 1e-6, "never drawn through the wall face");
        if (wall !== null && fitted > SIZE) near(right, X(wall), "a skin wider than the body stops at the wall face");
        else near((left + right) / 2, X(state.x + SIZE / 2), "centred on the body");
        const box = skinBox(state, w, h, AVATAR);
        near(left, X(box.left), "skinBox is what is drawn");
        near(top, Y(box.top), "skinBox is what is drawn");
        assert.ok(log.some((c) => c[0] === "set" && c[1] === "imageSmoothingEnabled" && c[2] === false), "nearest-neighbour");
        assert.ok(!player(log).some((c) => c[0] === "rotate"), "grounded: no spin");
      }
  // spin in the air and reduced motion follow the cube: each run takes off on its first airborne
  // frame and turns from there (src/spin.ts), so a run is seen at take-off, then 0.3 s on
  const spin = (reduced, skinArt) => {
    const air = pose({ grounded: false, time: 0 });
    frame(air, skinArt, { reduced });
    air.time = 0.3;
    return player(frame(air, skinArt, { reduced }).log).filter((c) => c[0] === "rotate");
  };
  assert.equal(spin(false).length, 1);
  assert.deepEqual(spin(false, art(16, 8)), spin(false));
  assert.deepEqual(spin(true, art(16, 8)), []);
  assert.deepEqual(spin(true), []);
  assert.deepEqual(fitSkin(32, 4, 1), { w: 1, h: 0.125 });
});

test("a skin never changes the body: the hitbox is the 0.64 square at every skin size and a run never sees a skin", () => {
  assert.equal(SIZE, 0.64);
  for (const [w, h] of [[4, 32], [32, 4], [16, 8], [32, 32]]) {
    const state = pose({ y: 1 });
    const body = hitbox(state);
    for (const [key, value] of Object.entries({ left: 9, right: 9.64, bottom: 1, top: 1.64 }))
      assert.ok(Math.abs(body[key] - value) < 1e-9, `${key} ${body[key]}`);
    const drawn = skinBox(state, w, h, AVATAR);
    assert.notDeepEqual(drawn, hitbox(state), "the drawn footprint is not the hitbox");
  }
  const run = new Run(LEVELS[0]);
  for (let i = 0; i < 600; i++) {
    if (i % 50 < 10) run.press();
    else run.release();
    run.advance(STEP);
  }
  assert.equal(JSON.stringify(run.state).includes("skin"), false);
});
