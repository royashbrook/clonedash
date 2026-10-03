import { SCALABLE, bounds, intersects, pieceSize, polygon, transform } from "./engine.ts";
import type { Level, Piece, Transform } from "./types.ts";

// Multi-select (#87): the editor acts on several pieces at once. These are the pure parts, so
// they run in node: what a swipe box catches, and moving, turning, flipping and copying a group
// as one shape.
export type Box = { left: number; right: number; bottom: number; top: number };

export function groupBox(pieces: Piece[]): Box {
  const all = pieces.map(bounds);
  return {
    left: Math.min(...all.map((b) => b.left)),
    right: Math.max(...all.map((b) => b.right)),
    bottom: Math.min(...all.map((b) => b.bottom)),
    top: Math.max(...all.map((b) => b.top)),
  };
}

// Every piece on the layer that the box touches, in drawing order.
export function inBox(level: Level, box: Box, layer?: string) {
  const area: [number, number][] = [
    [box.left, box.bottom],
    [box.right, box.bottom],
    [box.right, box.top],
    [box.left, box.top],
  ];
  return level.objects.flatMap((o, i) =>
    o.layer === layer && intersects(area, polygon(o)) ? [i] : [],
  );
}

const snap = (v: number) => Math.round(v * 20) / 20;

// Moves go piece by piece. A quarter turn or a flip turns the whole shape: each piece turns in
// place and its middle swings round the group, then the group is set back on the same bottom
// left corner, so a shape on the floor stays on the floor and on the grid.
export function transformGroup(pieces: Piece[], action: Transform, step = 1) {
  const out = pieces.map((o) => structuredClone(o));
  if (["left", "right", "up", "down"].includes(action)) {
    for (const o of out) transform(o, action, step);
    return out;
  }
  const before = groupBox(pieces);
  for (const o of out) {
    const { w, h } = pieceSize(o),
      cx = o.x + w / 2,
      cy = o.y + h / 2;
    const [nx, ny] =
      action === "cw"
        ? [cy, -cx]
        : action === "ccw"
          ? [-cy, cx]
          : action === "flipX"
            ? [-cx, cy]
            : [cx, -cy];
    // a mirror of the world is a flip in the piece's own frame plus the opposite turn
    if (action === "flipX" || action === "flipY") {
      o.rotation = (360 - o.rotation) % 360;
      if (action === "flipX") o.flipX = !o.flipX;
      else o.flipY = !o.flipY;
    } else transform(o, action);
    // a scaled piece grows from its own base, which a flip top to bottom moves to the other side
    const k = SCALABLE.includes(o.type) ? (o.scale ?? 1) : 1,
      lift = action === "flipY" ? (k - 1) * h : 0,
      a = (o.rotation * Math.PI) / 180;
    o.x = nx + lift * Math.sin(a) - w / 2;
    o.y = ny - lift * Math.cos(a) - h / 2;
  }
  const after = groupBox(out);
  for (const o of out) {
    o.x = snap(o.x + before.left - after.left);
    o.y = snap(o.y + before.bottom - after.bottom);
  }
  return out;
}

// Copies of the group, set just to its right, one group-width at a time until they clear
// everything already there (the group copy of duplicateObject).
export function duplicateGroup(level: Level, indices: number[]) {
  const pieces = indices.map((i) => level.objects[i]);
  if (!pieces.length) throw Error("Select an object to copy.");
  if (level.objects.length + pieces.length > 600)
    throw Error("This trail has reached 600 objects.");
  const box = groupBox(pieces),
    stride = Math.max(1, Math.ceil(box.right - box.left - 0.001));
  let shift = 0,
    copies: Piece[];
  do {
    shift += stride;
    copies = pieces.map((o) => ({ ...structuredClone(o), x: snap(o.x + shift) }));
    if (copies.some((c) => c.x > level.length - 2))
      throw Error("No room to the right. Move the group or lengthen the trail.");
  } while (
    copies.some((c) =>
      level.objects.some(
        (o) => o.layer === c.layer && intersects(polygon(c), polygon(o)),
      ),
    )
  );
  return copies;
}
