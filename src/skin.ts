// Skins (#107, docs/skins.md): pixel art for the player in square mode. Cosmetic only: nothing
// here reaches the engine's state, step or collisions. The model, its one validator, storage
// under its own key, the cds1 share codec and the editor's pure helpers.
import { SIZE } from "./engine.ts";
import { MAX_CODE, base64, boundedBytes } from "./transfer.ts";
import type { GameState } from "./types.ts";

export const SKINS = "clonedash.skins.v1";
export const MAX_SKINS = 100,
  MAX_NAME = 40,
  MIN_SIDE = 4,
  MAX_SIDE = 32,
  MAX_COLOURS = 16,
  MAX_SKIN_BYTES = 8 * 1024;
const MAX_ID = 1_000_000_000;
const PREFIX = "cds1.";
// a pixel is one character: 0 is empty, 1 is palette[0] ... g is palette[15]
const DIGITS = "0123456789abcdefg";
const COLOUR = /^#[0-9a-f]{6}$/;

export interface Skin {
  name: string;
  width: number;
  height: number;
  palette: string[];
  pixels: string;
}
export interface SkinEntry {
  id: number;
  skin: Skin;
}
export interface SkinStore {
  version: 1;
  next: number;
  skins: SkinEntry[];
  selected?: number;
}
// what the renderer draws: a tiny canvas built once from a validated skin
export interface SkinArt {
  image: CanvasImageSource;
  width: number;
  height: number;
}

const side = (v: unknown) =>
  Number.isInteger(v) && (v as number) >= MIN_SIDE && (v as number) <= MAX_SIDE;

// The one check every reader goes through. It rebuilds the skin from its five fields, so extra
// fields never travel or persist.
export function validateSkin(input: unknown): Skin {
  if (!input || typeof input !== "object" || Array.isArray(input))
    throw Error("This is not a skin.");
  const { name, width, height, palette, pixels } = input as Record<string, unknown>;
  if (typeof name !== "string" || name.length > MAX_NAME)
    throw Error(`A skin name is at most ${MAX_NAME} letters.`);
  if (!side(width) || !side(height))
    throw Error(`A skin is ${MIN_SIDE} to ${MAX_SIDE} pixels wide and tall.`);
  if (
    !Array.isArray(palette) ||
    palette.length > MAX_COLOURS ||
    palette.some((c) => typeof c !== "string" || !COLOUR.test(c)) ||
    new Set(palette).size !== palette.length
  )
    throw Error(`A skin has at most ${MAX_COLOURS} colours.`);
  if (
    typeof pixels !== "string" ||
    pixels.length !== (width as number) * (height as number)
  )
    throw Error("This skin's pixels do not match its size.");
  for (const ch of pixels) {
    const index = DIGITS.indexOf(ch);
    if (index < 0 || index > palette.length)
      throw Error("This skin uses a colour it does not have.");
  }
  return {
    name,
    width: width as number,
    height: height as number,
    palette: [...(palette as string[])],
    pixels,
  };
}
export const isBlank = (skin: Skin) => !/[^0]/.test(skin.pixels);
export const skinName = (skin: Skin) => skin.name || "Untitled skin";

export function emptyStore(): SkinStore {
  return { version: 1, next: 1, skins: [] };
}
// Reads the skins key. Invalid stored data throws; the caller must never write fallback data
// over it (docs/skins.md, storage).
export function readSkins(raw: string | null): SkinStore {
  if (raw === null) return emptyStore();
  const s = JSON.parse(raw);
  if (!s || typeof s !== "object" || Array.isArray(s) || s.version !== 1)
    throw Error("Invalid skins");
  if (!Number.isInteger(s.next) || s.next < 1 || s.next > MAX_ID)
    throw Error("Invalid skins");
  if (!Array.isArray(s.skins) || s.skins.length > MAX_SKINS)
    throw Error("Invalid skins");
  const ids = new Set<number>(),
    skins: SkinEntry[] = [];
  for (const entry of s.skins) {
    if (
      !entry ||
      typeof entry !== "object" ||
      !Number.isInteger(entry.id) ||
      entry.id < 1 ||
      entry.id >= s.next ||
      ids.has(entry.id)
    )
      throw Error("Invalid skin id");
    ids.add(entry.id);
    skins.push({ id: entry.id, skin: validateSkin(entry.skin) });
  }
  if (s.selected !== undefined) {
    const worn = skins.find((e) => e.id === s.selected);
    if (!worn || isBlank(worn.skin)) throw Error("Invalid worn skin");
  }
  return {
    version: 1,
    next: s.next,
    skins,
    ...(s.selected === undefined ? {} : { selected: s.selected }),
  };
}
export const wornSkin = (store: SkinStore) =>
  store.skins.find((e) => e.id === store.selected)?.skin ?? null;

// The store changes. Each mutates the store it is given (the fresh copy commitSkins read).
export function addSkin(store: SkinStore, input: Skin): number {
  const skin = validateSkin(input);
  if (store.skins.length >= MAX_SKINS)
    throw Error(`You have ${MAX_SKINS} skins. Delete one to make room. Nothing was replaced.`);
  if (store.next >= MAX_ID) throw Error("No room for another skin.");
  const id = store.next;
  store.skins.push({ id, skin });
  store.next = id + 1;
  return id;
}
// Saves over skin `id`, or adds a new skin when `id` is null or was deleted in another tab, so a
// draft is never lost. Returns the id it was saved under.
export function saveSkin(store: SkinStore, id: number | null, input: Skin): number {
  const skin = validateSkin(input),
    entry = store.skins.find((e) => e.id === id);
  if (!entry) return addSkin(store, skin);
  if (store.selected === id && isBlank(skin))
    throw Error("You are wearing this skin. Draw at least one pixel, or wear another skin first.");
  entry.skin = skin;
  return entry.id;
}
export function deleteSkin(store: SkinStore, id: number) {
  store.skins = store.skins.filter((e) => e.id !== id);
  // deleting the skin being worn goes back to the default cube
  if (store.selected === id) delete store.selected;
}
// null wears the default green cube
export function wearSkin(store: SkinStore, id: number | null) {
  if (id === null) {
    delete store.selected;
    return;
  }
  const entry = store.skins.find((e) => e.id === id);
  if (!entry) throw Error("That skin is gone. It may have been deleted in another tab.");
  if (isBlank(entry.skin)) throw Error("Draw at least one pixel before you wear a skin.");
  store.selected = id;
}

// Every skin write: re-read the key, apply one change to what is stored NOW (so another tab's
// skins survive), write, and read the write back. Throws, writing nothing, when the stored data is
// invalid or the change is refused; throws when the write is not confirmed. Never touches the
// level save.
export function commitSkins(
  storage: Pick<Storage, "getItem" | "setItem">,
  change: (latest: SkinStore) => void,
): SkinStore {
  let latest: SkinStore;
  try {
    latest = readSkins(storage.getItem(SKINS));
  } catch {
    throw Error("Your saved skins could not be read, so nothing was changed.");
  }
  change(latest);
  const raw = JSON.stringify(latest);
  readSkins(raw); // the change itself must leave a valid store
  try {
    storage.setItem(SKINS, raw);
  } catch {
    throw Error("Storage is full or blocked. Your skins were not changed.");
  }
  if (storage.getItem(SKINS) !== raw)
    throw Error("Storage could not confirm the save. Reload and check your skins.");
  return latest;
}

// ---- drawing ----

// The skin's rectangle in blocks, aspect kept, its longer side `avatar` blocks.
export function fitSkin(width: number, height: number, avatar: number) {
  const scale = avatar / Math.max(width, height);
  return { w: width * scale, h: height * scale };
}
type Pose = Pick<GameState, "x" | "y" | "gravity" | "wall">;
// Where a skin is drawn, in world blocks: its own fitted rectangle keeps the cube's anchoring
// (render.ts): bottom on the body's bottom edge, top on the body's top edge when gravity is
// flipped, right edge on a W wall's face.
export function skinBox(s: Pose, width: number, height: number, avatar: number) {
  const { w, h } = fitSkin(width, height, avatar),
    center = s.x + SIZE / 2,
    x = s.wall === null ? center : Math.min(center, s.wall - w / 2),
    bottom = s.gravity > 0 ? s.y + SIZE - h : s.y;
  return { left: x - w / 2, right: x + w / 2, bottom, top: bottom + h };
}
// The body that collides: SIZE square, whatever the skin.
export function hitbox(s: Pose) {
  return { left: s.x, right: s.x + SIZE, bottom: s.y, top: s.y + SIZE };
}

// A tiny canvas per skin, built once and kept in a small cache keyed by the (immutable) skin
// object, so a frame draws one image and never rebuilds pixels.
const ART = new Map<Skin, SkinArt>();
const ART_CACHE = 8;
export function skinArt(input: Skin): SkinArt {
  const hit = ART.get(input);
  if (hit) {
    ART.delete(input);
    ART.set(input, hit);
    return hit;
  }
  const skin = validateSkin(input),
    canvas = document.createElement("canvas");
  canvas.width = skin.width;
  canvas.height = skin.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw Error("Canvas 2D unavailable");
  const image = ctx.createImageData(skin.width, skin.height);
  for (let i = 0; i < skin.pixels.length; i++) {
    const index = DIGITS.indexOf(skin.pixels[i]);
    if (!index) continue;
    const c = skin.palette[index - 1];
    image.data.set(
      [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16), 255],
      i * 4,
    );
  }
  ctx.putImageData(image, 0, 0);
  const art = { image: canvas, width: skin.width, height: skin.height };
  ART.set(input, art);
  if (ART.size > ART_CACHE) ART.delete(ART.keys().next().value!);
  return art;
}

// ---- the editor's model: one colour string per cell, "" for empty ----

export function toCells(skin: Skin): string[] {
  return [...skin.pixels].map((ch) => {
    const index = DIGITS.indexOf(ch);
    return index ? skin.palette[index - 1] : "";
  });
}
// The palette is the colours used, in first-use order. Throws past 16 colours.
export function fromCells(name: string, width: number, height: number, cells: string[]): Skin {
  const palette: string[] = [];
  let pixels = "";
  for (const c of cells) {
    if (!c) {
      pixels += "0";
      continue;
    }
    let index = palette.indexOf(c);
    if (index < 0) index = palette.push(c) - 1;
    pixels += DIGITS[index + 1] ?? "?";
  }
  return validateSkin({ name, width, height, palette, pixels });
}
export function resizeCells(cells: string[], width: number, height: number, w: number, h: number) {
  // resizing keeps the top-left pixels
  return Array.from({ length: w * h }, (_, i) => {
    const x = i % w,
      y = Math.floor(i / w);
    return x < width && y < height ? cells[y * width + x] : "";
  });
}
export function dropsPixels(cells: string[], width: number, w: number, h: number) {
  return cells.some((c, i) => c && (i % width >= w || Math.floor(i / width) >= h));
}
// 4-connected flood fill of the region under (x, y); returns the cells it changed
export function fillCells(cells: string[], width: number, height: number, x: number, y: number, colour: string) {
  const from = cells[y * width + x];
  if (from === colour) return [];
  const changed: number[] = [],
    todo = [y * width + x],
    seen = new Uint8Array(cells.length);
  while (todo.length) {
    const i = todo.pop()!;
    if (seen[i] || cells[i] !== from) continue;
    seen[i] = 1;
    changed.push(i);
    const cx = i % width,
      cy = Math.floor(i / width);
    if (cx > 0) todo.push(i - 1);
    if (cx < width - 1) todo.push(i + 1);
    if (cy > 0) todo.push(i - width);
    if (cy < height - 1) todo.push(i + width);
  }
  return changed;
}
// Every cell on the straight line between two cells, ends included, each step to a touching cell,
// so a fast drag between two pointer samples skips nothing.
export function lineCells(x0: number, y0: number, x1: number, y1: number): [number, number][] {
  const out: [number, number][] = [],
    dx = Math.abs(x1 - x0),
    dy = -Math.abs(y1 - y0),
    sx = x0 < x1 ? 1 : -1,
    sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  for (;;) {
    out.push([x0, y0]);
    if (x0 === x1 && y0 === y1) return out;
    const e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      x0 += sx;
    }
    if (e2 <= dx) {
      err += dx;
      y0 += sy;
    }
  }
}
// The cell a pointer is over, from CSS client coordinates and the grid's CSS box (getBoundingClientRect),
// so device pixel ratio and page scroll never shift it. null outside the grid.
export function cellAt(
  clientX: number,
  clientY: number,
  box: { left: number; top: number; width: number; height: number },
  width: number,
  height: number,
): [number, number] | null {
  const x = Math.floor(((clientX - box.left) / box.width) * width),
    y = Math.floor(((clientY - box.top) / box.height) * height);
  return x >= 0 && y >= 0 && x < width && y < height ? [x, y] : null;
}

// ---- the cds1 share codec: the same envelope, bounded reader and five-second deadline as cdl1
// levels (src/transfer.ts), with a skin-sized byte bound ----

const portable = (skin: Skin) => validateSkin(skin); // the five fields, nothing local

export async function encodeSkin(input: Skin): Promise<string> {
  const raw = new TextEncoder().encode(JSON.stringify(portable(input)));
  if (raw.byteLength > MAX_SKIN_BYTES) throw Error("This skin is too large.");
  let payload = raw,
    flag = "0";
  let compressor: CompressionStream | undefined;
  if (typeof CompressionStream !== "undefined") {
    try {
      compressor = new CompressionStream("deflate-raw");
    } catch {
      /* Older browsers may implement gzip but not deflate-raw. */
    }
  }
  if (compressor) {
    const compressed = await boundedBytes(
      new Blob([raw]).stream().pipeThrough(compressor),
      MAX_SKIN_BYTES,
      "skin",
    );
    if (compressed.length < raw.length) {
      payload = compressed;
      flag = "1";
    }
  }
  return PREFIX + flag + base64(payload);
}

export async function decodeSkin(text: string): Promise<Skin> {
  if (text.length > MAX_CODE) throw Error("This skin code is too large.");
  let code = text.trim();
  if (/^https?:\/\//i.test(code)) {
    const params = new URLSearchParams(new URL(code).hash.slice(1));
    if (params.getAll("skin").length !== 1 || params.has("level"))
      throw Error("This link does not contain one skin.");
    code = params.get("skin")!;
  }
  if (!code.startsWith(PREFIX)) throw Error("Use a Cube Dash skin code or link (cds1).");
  const flag = code[PREFIX.length],
    encoded = code.slice(PREFIX.length + 1);
  if (!/[01]/.test(flag ?? "") || !/^[\w-]+$/.test(encoded)) throw Error("Invalid skin code.");
  // a code longer than the largest skin could ever encode to is refused before decoding it
  if (encoded.length > Math.ceil((MAX_SKIN_BYTES * 4) / 3)) throw Error("This skin is too large.");
  const bytes = Uint8Array.from(atob(encoded.replaceAll("-", "+").replaceAll("_", "/")), (c) =>
    c.charCodeAt(0),
  );
  if (base64(bytes) !== encoded) throw Error("Invalid skin code.");
  if (bytes.length > MAX_SKIN_BYTES) throw Error("This skin is too large.");
  let decoded = bytes;
  if (flag === "1") {
    if (typeof DecompressionStream === "undefined")
      throw Error("Update your browser to open compressed skins.");
    decoded = await boundedBytes(
      new Blob([bytes]).stream().pipeThrough(new DecompressionStream("deflate-raw")),
      MAX_SKIN_BYTES,
      "skin",
    );
  }
  return portable(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(decoded)));
}

export function skinLink(code: string, address: string): string {
  const url = new URL(address);
  url.search = "";
  url.hash = new URLSearchParams({ skin: code }).toString();
  return url.href;
}
