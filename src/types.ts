export type GameMode = "square" | "plane" | "wheel" | "pogo" | "angle";
// What the player SEES for an id whose upper-cased form is not the label. Stored ids that were
// renamed for real (jumper became pogo) are mapped on read instead: engine.ts LEGACY_TYPES.
const LABELS: Partial<Record<string, string>> = {
  "w-block": "WALL PASS",
  "r-block": "ROOF PASS",
  "speed-slow": "SLOW",
  "speed-normal": "NORMAL SPEED",
  "speed-fast": "FAST",
  "speed-faster": "FASTER",
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
  | "ring";
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
  color?: string; // rings only, #rrggbb; absent means the original yellow
  bounce?: number; // rings only, peak height in blocks; absent means the original 2.25
  flipsGravity?: true; // rings only, the dark blue orb: a tap flips gravity instead of bouncing
  boost?: true; // gravity rings only, the green one: the flip comes with a bounce up the screen
  dash?: true; // rings only, the dash orb: held, it carries the run the way it points (yellow, with flipsGravity: it flips you too)
  noTouch?: true; // drawn, never collides (any piece but a zone)
  wallPass?: true; // blocks and slopes: its side stops the run instead of crashing it, like a W
  roofPass?: true; // blocks: a head hit bumps instead of crashing, like an R
  edges?: Edges; // outlined blocks only, which sides get the white line; absent means all four
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
}
export interface SaveData {
  version: 1;
  best: Record<number, number>;
  draft: Level;
  sound: boolean;
  customLevels: { id: number; level: Level }[];
  activeLevel: number;
}
