// Loops (#121, docs/loops.md): a short song loop a player writes, plays live, saves and shares.
// The model, its one validator, storage under its own key, and the cdm1 share code. The sound is
// src/loop-player.ts; the instruments are the game's own (src/voices.ts).
import { trackFor } from "./music.ts";
import { MAX_CODE, packCode, unpackCode } from "./transfer.ts";
import { MAX_LOOP_BYTES, MAX_NAME, STEPS, DEGREES, DRUMS, int, validateLoop, type Loop } from "./loop-schema.ts";
export * from "./loop-schema.ts";

export const LOOPS = "clonedash.loops.v1";
export const MAX_LOOPS = 100;
const MAX_ID = 1_000_000_000;
const PREFIX = "cdm1.";

export interface LoopEntry {
  id: number;
  loop: Loop;
}
export interface LoopStore {
  version: 1;
  next: number;
  loops: LoopEntry[];
}

// ---- starting points ----

const DEFAULT_DRUMS = { kick: [0, 3, 5], snare: [4], hat: [0, 1, 2, 3, 4, 5, 6, 7] };
export function blankLoop(): Loop {
  return { name: "", root: 40, wobble: 2, drop: false, notes: Array.from({ length: STEPS }, () => []), ...structuredClone(DEFAULT_DRUMS) };
}
// a synthesized song's key, wobble and melody, with the default drums (index < 109)
export function loopFromSong(index: number): Loop {
  const song = trackFor(index);
  return validateLoop({ ...blankLoop(), name: song.name.slice(0, MAX_NAME), root: song.root, wobble: song.wobble, notes: song.melody.map((d) => [d]) });
}
// a random melody over the current key and drums
export function surprise(loop: Loop, random = Math.random): Loop {
  const notes = Array.from({ length: STEPS }, (_, s) =>
    random() < (s % 2 ? 0.55 : 0.85) ? [DEGREES[Math.floor(random() * DEGREES.length)]] : [],
  );
  return { ...loop, notes };
}
// one cell on or off, kept sorted
export function toggleNote(loop: Loop, step: number, degree: number): Loop {
  const at = loop.notes[step];
  const next = at.includes(degree) ? at.filter((d) => d !== degree) : [...at, degree].sort((a, b) => a - b);
  return validateLoop({ ...loop, notes: loop.notes.map((s, i) => (i === step ? next : s)) });
}
export function toggleDrum(loop: Loop, drum: (typeof DRUMS)[number], step: number): Loop {
  const at = loop[drum];
  const next = at.includes(step) ? at.filter((s) => s !== step) : [...at, step].sort((a, b) => a - b);
  return validateLoop({ ...loop, [drum]: next });
}

// ---- storage, the skin store's rules (src/skin.ts commitSkins) ----

export function emptyLoops(): LoopStore {
  return { version: 1, next: 1, loops: [] };
}
// Reads the loops key. Invalid stored data throws; the caller never writes fallback data over it.
export function readLoops(raw: string | null): LoopStore {
  if (raw === null) return emptyLoops();
  const s = JSON.parse(raw);
  if (!s || typeof s !== "object" || Array.isArray(s) || s.version !== 1) throw Error("Invalid loops");
  if (!int(s.next, 1, MAX_ID)) throw Error("Invalid loops");
  if (!Array.isArray(s.loops) || s.loops.length > MAX_LOOPS) throw Error("Invalid loops");
  const ids = new Set<number>(),
    loops: LoopEntry[] = [];
  for (const entry of s.loops) {
    if (!entry || typeof entry !== "object" || !int(entry.id, 1, s.next - 1) || ids.has(entry.id))
      throw Error("Invalid loop id");
    ids.add(entry.id);
    loops.push({ id: entry.id, loop: validateLoop(entry.loop) });
  }
  return { version: 1, next: s.next, loops };
}
export function addLoop(store: LoopStore, input: Loop): number {
  const loop = validateLoop(input);
  if (store.loops.length >= MAX_LOOPS)
    throw Error(`You have ${MAX_LOOPS} loops. Delete one to make room. Nothing was replaced.`);
  if (store.next >= MAX_ID) throw Error("No room for another loop.");
  const id = store.next;
  store.loops.push({ id, loop });
  store.next = id + 1;
  return id;
}
// Saves over loop `id`, or adds it when `id` is null or was deleted in another tab, so a draft is
// never lost. Returns the id it was saved under.
export function saveLoop(store: LoopStore, id: number | null, input: Loop): number {
  const loop = validateLoop(input),
    entry = store.loops.find((e) => e.id === id);
  if (!entry) return addLoop(store, loop);
  entry.loop = loop;
  return entry.id;
}
export function deleteLoop(store: LoopStore, id: number) {
  store.loops = store.loops.filter((e) => e.id !== id);
}
// Every loop write: re-read the key, apply one change to what is stored now, write, read back.
// Stale-tab preservation, not simultaneous-write safety, exactly as commitSkins. Never touches the
// level save or skins.
export function commitLoops(
  storage: Pick<Storage, "getItem" | "setItem">,
  change: (latest: LoopStore) => void,
): LoopStore {
  let latest: LoopStore;
  try {
    latest = readLoops(storage.getItem(LOOPS));
  } catch {
    throw Error("Your saved loops could not be read, so nothing was changed.");
  }
  change(latest);
  const raw = JSON.stringify(latest);
  readLoops(raw); // the change itself must leave a valid store
  try {
    storage.setItem(LOOPS, raw);
  } catch {
    throw Error("Storage is full or blocked. Your loops were not changed.");
  }
  if (storage.getItem(LOOPS) !== raw) throw Error("Storage could not confirm the save. Reload and check your loops.");
  return latest;
}

// ---- the cdm1 share code ----

export async function encodeLoop(input: Loop): Promise<string> {
  return packCode(PREFIX, new TextEncoder().encode(JSON.stringify(validateLoop(input))), MAX_LOOP_BYTES, "loop");
}
export async function decodeLoop(text: string): Promise<Loop> {
  if (text.length > MAX_CODE) throw Error("This loop code is too large.");
  let code = text.trim();
  if (/^https?:\/\//i.test(code)) {
    const params = new URLSearchParams(new URL(code).hash.slice(1));
    if (params.getAll("loop").length !== 1 || params.has("level") || params.has("skin") || params.has("save"))
      throw Error("This link does not contain one loop.");
    code = params.get("loop")!;
  }
  if (!code.startsWith(PREFIX)) throw Error("Use a Cube Dash loop code or link (cdm1).");
  return validateLoop(JSON.parse(await unpackCode(code, PREFIX, MAX_LOOP_BYTES, "loop")));
}
export function loopLink(code: string, address: string): string {
  const url = new URL(address);
  url.search = "";
  url.hash = new URLSearchParams({ loop: code }).toString();
  return url.href;
}
