import { MAX_COINS, coinCount, validateLevel } from "./engine.ts";
import type { GameState, Level, SaveData } from "./types.ts";

export const SAVE = "clonedash.v1";
const coinBest = (v: unknown) =>
  Number.isInteger(v) && (v as number) >= 0 && (v as number) <= MAX_COINS;
// The best coins to show for a level: never more than it holds now, so editing coins out of a
// level can't leave a best of 7 / 5 (the stored number is clamped on read, not rewritten).
export const shownCoins = (best: number | undefined, level: Level) =>
  Math.min(best ?? 0, coinCount(level));
// Keeps a finished run's coins if they beat the best. A run that died keeps nothing: the best is
// the most picked up in one completed run, never a sum over tries. True when the save changed.
export function keepCoins(
  save: SaveData,
  run: GameState,
  level: Level,
  custom: boolean,
  trail: number,
) {
  if (run.status !== "complete" || !run.fx?.coinTotal) return false;
  const got = run.fx.coins;
  if (custom) {
    const entry = save.customLevels.find((e) => e.id === save.activeLevel);
    if (!entry || got <= shownCoins(entry.coins, level)) return false;
    entry.coins = got;
    return true;
  }
  if (got <= shownCoins(save.coins?.[trail], level)) return false;
  save.coins = { ...save.coins, [trail]: got };
  return true;
}
export function readSave(raw: string | null, trailCount: number): SaveData {
  const s = (
    raw
      ? JSON.parse(raw)
      : {
          version: 1,
          best: {},
          draft: { name: "My trail", length: 40, objects: [] },
          sound: false,
        }
  ) as SaveData;
  if (
    s.version !== 1 ||
    !s.best ||
    typeof s.best !== "object" ||
    Array.isArray(s.best)
  )
    throw Error("Invalid save");
  // The validated copy is kept: it carries renamed piece ids (engine.ts LEGACY_TYPES) forward, so
  // a save from before a rename loads and is written back with the current ids.
  s.draft = validateLevel(s.draft);
  if (
    Object.entries(s.best).some(
      ([k, v]) =>
        !/^\d+$/.test(k) ||
        +k >= trailCount ||
        !Number.isFinite(v) ||
        v < 0 ||
        v > 100,
    )
  )
    throw Error("Invalid progress");
  // best coins (2026-11) are optional, so a save from before them reads back unchanged
  if (
    s.coins !== undefined &&
    (!s.coins ||
      typeof s.coins !== "object" ||
      Array.isArray(s.coins) ||
      Object.entries(s.coins).some(
        ([k, v]) => !/^\d+$/.test(k) || +k >= trailCount || !coinBest(v),
      ))
  )
    throw Error("Invalid progress");
  if (s.customLevels === undefined) {
    // Keep the old draft byte-for-byte; its first original song is the implicit default.
    s.customLevels = [{ id: 1, level: structuredClone(s.draft) }];
    s.activeLevel = 1;
  }
  if (
    !Array.isArray(s.customLevels) ||
    !s.customLevels.length ||
    s.customLevels.length > 100
  )
    throw Error("Invalid library");
  const ids = new Set();
  for (const entry of s.customLevels) {
    if (
      !entry ||
      !Number.isInteger(entry.id) ||
      entry.id < 1 ||
      entry.id > 100 ||
      ids.has(entry.id)
    )
      throw Error("Invalid level ID");
    if (entry.coins !== undefined && !coinBest(entry.coins))
      throw Error("Invalid progress");
    entry.level = validateLevel(entry.level);
    ids.add(entry.id);
  }
  if (!ids.has(s.activeLevel)) throw Error("Missing active level");
  // The draft remains the last-edited copy, including saves from an older app tab.
  s.customLevels.find((e) => e.id === s.activeLevel)!.level = structuredClone(
    s.draft,
  );
  return s;
}
export function storeDraft(save: SaveData, draft: Level) {
  const level = validateLevel(draft);
  save.draft = level;
  save.customLevels.find((e) => e.id === save.activeLevel)!.level =
    structuredClone(level);
}
export function selectLevel(save: SaveData, id: number) {
  const entry = save.customLevels.find((e) => e.id === id);
  if (!entry) throw Error("Missing level");
  save.activeLevel = id;
  save.draft = structuredClone(entry.level);
  return structuredClone(save.draft);
}
export function newLevel(save: SaveData) {
  if (save.customLevels.length >= 100)
    throw Error("Your library holds up to 100 levels.");
  let id = 1;
  while (save.customLevels.some((e) => e.id === id)) id++;
  const level = {
    name: `My trail ${id}`,
    length: 40,
    height: 7,
    song: 8 + id,
    objects: [],
  };
  save.customLevels.push({ id, level });
  return selectLevel(save, id);
}
// Removes one custom level and returns the draft to edit next. readSave enforces that the
// library is never empty and that the active level exists, so deleting the last level leaves a
// fresh one and deleting the active level moves to its neighbour.
export function deleteLevel(save: SaveData, id: number) {
  const index = save.customLevels.findIndex((e) => e.id === id);
  if (index < 0) throw Error("Missing level");
  save.customLevels.splice(index, 1);
  if (!save.customLevels.length) return newLevel(save);
  if (save.activeLevel === id)
    return selectLevel(
      save,
      save.customLevels[Math.min(index, save.customLevels.length - 1)].id,
    );
  return structuredClone(save.draft);
}
