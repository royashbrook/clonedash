export type GameMode = "square" | "plane" | "wheel" | "pogo" | "angle" | "croissant";
// What the player SEES for an id whose upper-cased form is not the label. Stored ids that were
// renamed for real (jumper became pogo) are mapped on read instead: engine.ts LEGACY_TYPES.
const LABELS: Partial<Record<string, string>> = {
  "w-block": "WALL PASS",
  "r-block": "ROOF PASS",
  "speed-slow": "SLOW",
  "speed-normal": "NORMAL SPEED",
  "speed-fast": "FAST",
  "speed-faster": "FASTER",
  "move-trigger": "MOVE TRIGGER",
  "color-trigger": "COLOR TRIGGER",
};
export const labelOf = (id: string): string => LABELS[id] ?? id.toUpperCase();
export type ObjectType =
  | GameMode
  | "gravity-up"
  | "gravity-down"
  | "speed-slow"
  | "speed-normal"
  | "speed-fast"
  | "speed-faster"
  | "block"
  | "grid"
  | "black"
  | "outline"
  | "plain-black"
  | "w-block"
  | "r-block"
  | "spike"
  | "half"
  | "small"
  | "quarter"
  | "ramp"
  | "ramp-grid"
  | "ramp-black"
  | "scoop"
  | "scoop-grid"
  | "scoop-black"
  | "hill"
  | "hill-grid"
  | "hill-black"
  | "ring"
  | "coin"
  | "move-trigger"
  | "color-trigger";
export type Point = [number, number];
export type Transform =
  "left" | "right" | "up" | "down" | "cw" | "ccw" | "flipX" | "flipY";
export interface Piece {
  type: ObjectType;
  x: number;
  y: number;
  rotation: number;
  flipX: boolean;
  flipY: boolean;
  layer?: "background";
  scale?: number; // blocks, spikes and ramps only; absent means 1 (kept absent so old levels stay byte-identical)
  color?: string; // rings and colour triggers, #rrggbb; absent means the original yellow
  bounce?: number; // rings only, peak height in blocks; absent means the original 2.25
  flipsGravity?: true; // rings only, the dark blue orb: a tap flips gravity instead of bouncing
  boost?: true; // gravity rings only, the green one: the flip comes with a bounce up the screen
  dash?: true; // rings only, the dash orb: held, it carries the run the way it points (yellow, with flipsGravity: it flips you too)
  noTouch?: true; // drawn, never collides (any piece but a zone)
  hidden?: true; // collides, never drawn in play; the editor shows it faint (any piece but a zone)
  wallPass?: true; // blocks and slopes: its side stops the run instead of crashing it, like a W
  roofPass?: true; // blocks: a head hit bumps instead of crashing, like an R
  edges?: Edges; // outlined blocks only, which sides get the white line; absent means all four
  group?: number; // 1..99, what a trigger aims at; any piece but a trigger, absent means none
  target?: number; // triggers only, the group it works on; absent means it does nothing
  moveX?: number; // move triggers only, whole blocks right (negative is left); absent means 0
  moveY?: number; // move triggers only, whole blocks up (negative is down); absent means 0
  duration?: number; // triggers only, seconds the move or fade takes; absent means instant
}
// Outline variants, in the block's own frame (rotation and flips turn them): edge = the top
// side, parallel = top and bottom, outer = top and left meeting at a corner, inner = a short
// corner mark at the top left. Drawing only; collision is the full block either way.
export type Edges = "edge" | "parallel" | "outer" | "inner" | "none";
export interface Level {
  name: string;
  length: number;
  objects: Piece[];
  height?: number;
  song?: number;
  note?: string;
  color?: string;
}
export interface GameState {
  x: number;
  y: number;
  vy: number;
  mode: GameMode;
  gravity: number;
  speed: number; // forward speed multiplier, 1 until a speed portal changes it
  wall: number | null; // the wall face a W is holding the run against this step, else null
  dash: number | null; // the climb (rise per block forward) of the dash orb being held, else null
  inputHeld: boolean;
  grounded: boolean;
  status: "playing" | "dead" | "complete";
  time: number;
  touchingPortals: number[];
  usedRings: number[];
  level: Level;
  // Coins and triggers, only on a run of a level that has them, so a run of any other level has
  // exactly the state it always had. engine.ts effects() builds it once per run.
  fx?: RunEffects;
}
// Everything a run does to its level lives here and in the run's own copy of the level; the
// authored level is never written. Arrays are sized once per run, indexed by object.
export interface RunEffects {
  coinTotal: number;
  coins: number; // picked up this run
  got: Uint8Array; // 1 once that coin is picked up
  picked: number[]; // coins picked up by this step's contact pass, undone if contact runs again
  triggers: number[]; // trigger indices, in authored order (the order ties fire in)
  fired: Uint8Array; // 1 once that trigger has fired this run
  groups: Map<number, number[]>; // group id -> member indices, built once per run
  // a move command per object, 6 slots: from x, from y, offset x, offset y, start, length
  move: Float64Array;
  movers: number[]; // objects with a move still running
  // a colour command per object, 8 slots: from r, g, b, alpha, to r, g, b, start; and its length
  tint: Float64Array;
  fade: Float64Array;
  tinted: Uint8Array;
}
export interface SaveData {
  version: 1;
  best: Record<number, number>;
  coins?: Record<number, number>; // best coins in one completed run, per built-in trail
  draft: Level;
  sound: boolean;
  customLevels: { id: number; level: Level; coins?: number }[]; // coins: as above, per level
  activeLevel: number;
}
