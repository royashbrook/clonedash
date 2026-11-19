// A whole save moving to another device (#124): progress, settings, custom levels and skins as one
// cdb1 code, in the same envelope as a skin (src/transfer.ts packCode). The game's own readers stay
// the authority on what a store may hold; this file adds what they do not check: every field is
// one this version knows, of the type it expects, and reading it back changes nothing. A save
// that fails any of that is refused whole, never loaded in part. An unknown field at the save,
// game, level-entry, level or piece level says "newer"; an unknown field inside a skin is dropped
// by its reader, so it is refused as damaged instead.
// Loops (#121) are an optional part: a save without them is byte-for-byte what 1.0.85 made, and
// loading one REPLACES this device's loops (absent removes them). A loop's raw fields are checked
// before its reader runs, because validateLoop drops what it does not know.
import { SAVE, readSave } from "./library.ts";
import { LOOPS, readLoops, type LoopStore } from "./loop.ts";
import { SKINS, readSkins, type SkinStore } from "./skin.ts";
import { MAX_SAVE_BYTES, MAX_SAVE_TEXT, packCode, portableLevel, unpackCode } from "./transfer.ts";
import type { SaveData } from "./types.ts";

export const BACKUP_PREFIX = "cdb1.";
// the transfer ceiling for one whole save, the same both ways (src/transfer.ts)
export const MAX_BACKUP_BYTES = MAX_SAVE_BYTES;
export interface Backup {
  game: SaveData;
  skins: SkinStore;
  loops?: LoopStore;
}
const LOOP_FIELDS = ["name", "root", "wobble", "drop", "notes", "kick", "snare", "hat"];

const NEWER = "This save is from a newer Cube Dash. Update the game, then load it again.";
const DAMAGED = "This save is damaged, so nothing was loaded.";
const plain = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);
const sorted = (v: unknown): unknown =>
  Array.isArray(v)
    ? v.map(sorted)
    : plain(v)
      ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, sorted(v[k])]))
      : v;
// equal as data, whatever order the keys were written in
const same = (a: unknown, b: unknown) => JSON.stringify(sorted(a)) === JSON.stringify(sorted(b));
export const sameData = (a: Backup, b: Backup) => same(a, b);

// every key known, every required key present
function fields(v: unknown, known: string[], required: string[]): Record<string, unknown> {
  if (!plain(v)) throw Error(DAMAGED);
  if (Object.keys(v).some((k) => !known.includes(k))) throw Error(NEWER);
  if (required.some((k) => !(k in v))) throw Error(DAMAGED);
  return v;
}

// The whole check, run before encoding and after decoding, so a code this game makes is always
// one it accepts. trailCount is the number of built-in levels (progress keys must name one).
export function checkBackup(input: unknown, trailCount: number): Backup {
  const top = fields(input, ["v", "game", "skins", "loops"], ["v", "game", "skins"]);
  if (top.v !== 1) throw Error(typeof top.v === "number" && top.v > 1 ? NEWER : DAMAGED);
  const game = fields(
    top.game,
    ["version", "best", "coins", "draft", "sound", "customLevels", "activeLevel"],
    ["version", "best", "draft", "sound", "customLevels", "activeLevel"],
  );
  if (typeof game.sound !== "boolean" || !Number.isInteger(game.activeLevel)) throw Error(DAMAGED);
  if (!Array.isArray(game.customLevels)) throw Error(DAMAGED);
  for (const entry of game.customLevels) fields(entry, ["id", "level", "coins"], ["id", "level"]);
  // a level's own loop (#121): its raw fields are checked here, before its reader can drop any
  for (const level of [game.draft, ...game.customLevels.map((e) => (e as Record<string, unknown>).level)])
    if (plain(level) && "loop" in level) fields(level.loop, LOOP_FIELDS, LOOP_FIELDS);
  const skins = fields(top.skins, ["version", "next", "skins", "selected"], ["version", "next", "skins"]);
  if (!Array.isArray(skins.skins)) throw Error(DAMAGED);
  for (const entry of skins.skins) fields(entry, ["id", "skin"], ["id", "skin"]);
  let readGame: SaveData, readSkinStore: SkinStore;
  try {
    readGame = readSave(JSON.stringify(game), trailCount);
    readSkinStore = readSkins(JSON.stringify(skins));
  } catch {
    throw Error(DAMAGED);
  }
  // the readers drop or rewrite what they do not keep; a save they would change is not loaded
  if (!same(readGame, game) || !same(readSkinStore, skins)) throw Error(DAMAGED);
  // readSave keeps piece fields it does not know, so each level is also held to the share
  // whitelist; the one difference allowed is the default song a level from before songs lacks
  for (const level of [readGame.draft, ...readGame.customLevels.map((e) => e.level)])
    if (!same(portableLevel(level), level.loop ? level : { ...level, song: level.song ?? 9 })) throw Error(NEWER);
  if (!("loops" in top)) return { game: readGame, skins: readSkinStore };
  const loops = fields(top.loops, ["version", "next", "loops"], ["version", "next", "loops"]);
  if (!Array.isArray(loops.loops)) throw Error(DAMAGED);
  for (const entry of loops.loops) fields(fields(entry, ["id", "loop"], ["id", "loop"]).loop, LOOP_FIELDS, LOOP_FIELDS);
  let readLoopStore: LoopStore;
  try {
    readLoopStore = readLoops(JSON.stringify(loops));
  } catch {
    throw Error(DAMAGED);
  }
  if (!same(readLoopStore, loops)) throw Error(DAMAGED);
  return { game: readGame, skins: readSkinStore, loops: readLoopStore };
}

export async function encodeBackup(backup: Backup, trailCount: number): Promise<string> {
  const checked = checkBackup({ v: 1, ...backup }, trailCount);
  const raw = new TextEncoder().encode(JSON.stringify({ v: 1, ...checked }));
  return packCode(BACKUP_PREFIX, raw, MAX_BACKUP_BYTES, "save");
}

export async function decodeBackup(text: string, trailCount: number): Promise<Backup> {
  if (text.length > MAX_SAVE_TEXT) throw Error("This save is too large.");
  let code = text.trim();
  if (/^https?:\/\//i.test(code)) {
    const params = new URLSearchParams(new URL(code).hash.slice(1));
    if (params.getAll("save").length !== 1 || params.has("level") || params.has("skin") || params.has("loop"))
      throw Error("This link does not contain one save.");
    code = params.get("save")!;
  }
  if (!code.startsWith(BACKUP_PREFIX))
    throw Error(/^cdb\d+\./.test(code) ? NEWER : "Use a Cube Dash save code or link (cdb1).");
  let data: unknown;
  try {
    data = JSON.parse(await unpackCode(code, BACKUP_PREFIX, MAX_BACKUP_BYTES, "save"));
  } catch (cause) {
    // the envelope's own words (too large, update your browser) are already plain
    if (cause instanceof SyntaxError) throw Error(DAMAGED);
    throw cause;
  }
  return checkBackup(data, trailCount);
}

export function backupLink(code: string, address: string): string {
  const url = new URL(address);
  url.search = "";
  url.hash = new URLSearchParams({ save: code }).toString();
  return url.href;
}

// What a save holds, for the screen that asks before replacing.
export function summary(backup: Backup) {
  return {
    played: Object.values(backup.game.best).filter((b) => b > 0).length,
    levels: backup.game.customLevels.length,
    skins: backup.skins.skins.length,
    loops: backup.loops?.loops.length ?? 0,
  };
}

// Written first by a load that starts (pending) and last by one that finished (done), each with
// a fresh id. Every open tab remembers the value it loaded with and reads it again before each of
// its own writes: a different value means another tab loaded a save, so that tab reloads instead
// of writing its old save back (storage events are only the fast path, they can arrive late). A
// boot that finds it pending knows a load did not finish.
export const IMPORT = "clonedash.import";

// localStorage writes one key per call, never several as one step, so this is the policy: snapshot
// both stores, write both, read both back. On any failure both are put back as they were (a key
// that was absent is removed again) and the error says nothing changed. If putting them back fails
// too, the error names which parts may now be from the new save. Success is only reported after
// both read back exactly as written.
export function writeBackup(storage: Storage, backup: Backup, trailCount: number) {
  // the whole check again, here at the last step before anything is written
  const checked = checkBackup({ v: 1, ...backup }, trailCount);
  // each part's new value; null means the key is removed (a save without loops replaces this
  // device's loops with none)
  const parts: [string, string | null, string][] = [
    [SAVE, JSON.stringify(checked.game), "levels and progress"],
    [SKINS, JSON.stringify(checked.skins), "skins"],
    [LOOPS, checked.loops ? JSON.stringify(checked.loops) : null, "loops"],
  ];
  const before = parts.map(([key]) => storage.getItem(key)),
    marker = storage.getItem(IMPORT),
    id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  storage.setItem(IMPORT, JSON.stringify({ state: "pending", id }));
  try {
    for (const [key, value] of parts)
      if (value === null) storage.removeItem(key);
      else storage.setItem(key, value);
    if (parts.some(([key, value]) => storage.getItem(key) !== value))
      throw Error("A store did not read back as written.");
  } catch (cause) {
    const stuck: string[] = [];
    parts.forEach(([key, , name], i) => {
      try {
        if (storage.getItem(key) === before[i]) return; // never changed, nothing to put back
        if (before[i] === null) storage.removeItem(key);
        else storage.setItem(key, before[i]!);
        if (storage.getItem(key) !== before[i]) stuck.push(name);
      } catch {
        stuck.push(name);
      }
    });
    if (stuck.length)
      throw Error(
        `Loading stopped partway and could not be undone, so your ${stuck.join(" and ")} may be ` +
          "from the new save. Free some space on this device and load the save again.",
        { cause },
      );
    // nothing changed, so the marker goes back to what it was too: other tabs then see no load
    if (marker === null) storage.removeItem(IMPORT);
    else storage.setItem(IMPORT, marker);
    throw Error("There isn't room to load this save on this device. Nothing was changed.", { cause });
  }
  // both stores are in. If even this small marker cannot be written, the pending one stays (it is
  // still the signal other tabs check) and the load is reported as not finished, never as done.
  try {
    storage.setItem(IMPORT, JSON.stringify({ state: "done", id }));
  } catch (cause) {
    throw Error(
      "The save was copied in, but this device ran out of room before it finished. Free some " +
        "space, then load the save again.",
      { cause },
    );
  }
}
