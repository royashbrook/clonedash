import { validateLevel } from "./engine.ts";
import type { Level, SaveData } from "./types.ts";

export const SAVE = "clonedash.v1";
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
  validateLevel(s.draft);
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
    validateLevel(entry.level);
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
