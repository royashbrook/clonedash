import type { Point } from "./types.ts";
// Two-finger transform of the selected piece, the way a photo crops: the distance between the
// fingers sets the size, the angle between them sets the rotation. Screen y points down, so a
// clockwise turn on screen grows the screen angle while the editor's rotation is anticlockwise.
export interface Pinch {
  d0: number;
  a0: number;
  scale0: number;
  rotation0: number;
}
export const SNAP_ANGLE = 15,
  SNAP_SCALE = 0.25;
export function pinchStart(
  a: Point,
  b: Point,
  scale0: number,
  rotation0: number,
): Pinch {
  return { d0: Math.max(1, Math.hypot(b[0] - a[0], b[1] - a[1])), a0: Math.atan2(b[1] - a[1], b[0] - a[0]), scale0, rotation0 };
}
export function pinchTransform(
  p: Pinch,
  a: Point,
  b: Point,
  snap: boolean,
  scalable: boolean,
) {
  const d = Math.hypot(b[0] - a[0], b[1] - a[1]),
    angle = Math.atan2(b[1] - a[1], b[0] - a[0]);
  const rawScale = (p.scale0 * d) / p.d0,
    rawRotation = p.rotation0 - ((angle - p.a0) * 180) / Math.PI;
  const scaleStep = snap ? SNAP_SCALE : 0.05,
    angleStep = scalable ? (snap ? SNAP_ANGLE : 1) : 90;
  const scale = scalable
    ? Math.min(4, Math.max(0.25, Math.round(rawScale / scaleStep) * scaleStep))
    : 1;
  const rotation =
    ((Math.round(rawRotation / angleStep) * angleStep) % 360 + 360) % 360;
  return { scale: Math.round(scale * 100) / 100, rotation };
}
