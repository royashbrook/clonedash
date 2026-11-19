// What a loop is (#121, docs/loops.md): the shape and its one validator, with no imports, so a
// level (src/engine.ts validateLevel) can carry a loop without pulling in the store, the presets
// or the share code (src/loop.ts re-exports all of this).
export const MAX_NAME = 40,
  MAX_LOOP_BYTES = 8 * 1024,
  STEPS = 8,
  MIN_ROOT = 36,
  MAX_ROOT = 48,
  MIN_WOBBLE = 1,
  MAX_WOBBLE = 8;
// the one scale every melody note comes from, low to high
export const DEGREES = [0, 3, 5, 7, 10, 12, 15, 17, 19, 22];
export const DRUMS = ["kick", "snare", "hat"] as const;

export interface Loop {
  name: string;
  root: number;
  wobble: number;
  drop: boolean;
  notes: number[][];
  kick: number[];
  snare: number[];
  hat: number[];
}

export const int = (v: unknown, lo: number, hi: number) =>
  Number.isInteger(v) && (v as number) >= lo && (v as number) <= hi;
// sorted, distinct, every value allowed
const set = (v: unknown, ok: (x: unknown) => boolean) =>
  Array.isArray(v) && v.every(ok) && v.every((x, i) => i === 0 || (x as number) > (v[i - 1] as number));

// The one check every reader goes through. It rebuilds the loop from its eight fields, so extra
// fields never travel or persist (a whole save checks its raw fields before this, src/backup.ts).
export function validateLoop(input: unknown): Loop {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw Error("This is not a loop.");
  const { name, root, wobble, drop, notes, kick, snare, hat } = input as Record<string, unknown>;
  if (typeof name !== "string" || name.length > MAX_NAME)
    throw Error(`A loop name is at most ${MAX_NAME} letters.`);
  if (!int(root, MIN_ROOT, MAX_ROOT) || !int(wobble, MIN_WOBBLE, MAX_WOBBLE) || typeof drop !== "boolean")
    throw Error("This loop's key, wobble or drop is not one the game knows.");
  if (!Array.isArray(notes) || notes.length !== STEPS || !notes.every((s) => set(s, (d) => DEGREES.includes(d as number))))
    throw Error("This loop's notes are not ones the game knows.");
  const step = (s: unknown) => int(s, 0, STEPS - 1);
  if (![kick, snare, hat].every((d) => set(d, step))) throw Error("This loop's drums are not ones the game knows.");
  return {
    name,
    root: root as number,
    wobble: wobble as number,
    drop,
    notes: (notes as number[][]).map((s) => [...s]),
    kick: [...(kick as number[])],
    snare: [...(snare as number[])],
    hat: [...(hat as number[])],
  };
}
export const loopName = (loop: Loop) => loop.name || "Untitled loop";
