export type GameMode = "square" | "plane" | "wheel" | "jumper";
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
