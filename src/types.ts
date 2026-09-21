export type GameMode = "square" | "plane" | "wheel" | "jumper";
// What the player SEES for an id. The ids themselves are stored in levels and saves, so a real
// rename is a breaking (major-version) change; this map is the label-only rename until then.
const LABELS: Partial<Record<string, string>> = { jumper: "POGO" };
export const labelOf = (id: string): string => LABELS[id] ?? id.toUpperCase();
export type ObjectType =
  | GameMode
  | "gravity-up"
  | "gravity-down"
  | "block"
  | "grid"
  | "black"
  | "outline"
  | "plain-black"
  | "spike"
  | "half"
  | "small"
  | "quarter"
  | "ramp"
  | "ramp-grid"
  | "ramp-black"
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
}
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
