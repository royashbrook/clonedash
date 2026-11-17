import type { Point } from "./types.ts";
// Two-finger transform of the selected piece, the way a photo crops: the distance between the
// fingers sets the size, the angle between them sets the rotation. Screen y points down, so a
// clockwise turn on screen grows the screen angle while the editor's rotation is anticlockwise.
// The size is one common factor on both axes (#117), so a piece keeps its width-to-height shape.
export interface Pinch {
  d0: number;
  a0: number;
  kx0: number;
  ky0: number;
  rotation0: number;
}
export const SNAP_ANGLE = 15,
  SNAP_SCALE = 0.25;
const MIN = 0.25,
  MAX = 4;
export function pinchStart(
  a: Point,
  b: Point,
  size: number | [number, number], // one number is both axes
  rotation0: number,
): Pinch {
  const [kx0, ky0] = typeof size === "number" ? [size, size] : size;
  return { d0: Math.max(1, Math.hypot(b[0] - a[0], b[1] - a[1])), a0: Math.atan2(b[1] - a[1], b[0] - a[0]), kx0, ky0, rotation0 };
}
export function pinchTransform(
  p: Pinch,
  a: Point,
  b: Point,
  snap: boolean,
  scalable: boolean,
  turnable = scalable, // any angle; otherwise quarter turns (a ring sizes but quarter-turns, #106)
) {
  const d = Math.hypot(b[0] - a[0], b[1] - a[1]),
    angle = Math.atan2(b[1] - a[1], b[0] - a[0]);
  const rawRotation = p.rotation0 - ((angle - p.a0) * 180) / Math.PI,
    angleStep = turnable ? (snap ? SNAP_ANGLE : 1) : 90;
  const rotation =
    ((Math.round(rawRotation / angleStep) * angleStep) % 360 + 360) % 360;
  if (!scalable) return { scaleX: 1, scaleY: 1, rotation };
  // the factor is held so neither axis leaves 0.25..4
  const big = Math.max(p.kx0, p.ky0),
    low = Math.max(MIN / p.kx0, MIN / p.ky0),
    high = Math.min(MAX / p.kx0, MAX / p.ky0),
    hold = (f: number) => Math.min(high, Math.max(low, f));
  let f = hold(d / p.d0);
  // snap: the larger axis lands on a quarter (inside the bounds), the other follows
  if (snap) f = hold(Math.min(MAX, Math.max(MIN, Math.round((big * f) / SNAP_SCALE) * SNAP_SCALE)) / big);
  const axis = (k: number) => Math.min(MAX, Math.max(MIN, Math.round(k * f * 20) / 20));
  return { scaleX: axis(p.kx0), scaleY: axis(p.ky0), rotation };
}
