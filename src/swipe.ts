import { buildBounds, coinCount, intersects, parts, validateLevel, MAX_COINS, TRIGGERS, ZONES } from "./engine.ts";
import type { Level, Piece, Point } from "./types.ts";

// SWIPE (#106, docs/ramps-and-boosters.md rule 6): one finger dragged across the editor grid paints
// the chosen piece, or with ERASE removes pieces. These are the pure parts, so they run in node.

// The cells a straight drag from a to b passes through, in order and with no gap: a walk along
// the grid, so a fast drag that reports few samples covers every cell a slow one would. A cell is
// the one a tap at that point places into (App.svelte editAt): x rounds to the nearest step, y
// rounds down. Cells come back as the piece's x and y.
export function cellsAlong(a: Point, b: Point, step: number): Point[] {
  const ax = a[0] / step + 0.5,
    ay = a[1] / step,
    bx = b[0] / step + 0.5,
    by = b[1] / step,
    ei = Math.floor(bx),
    ej = Math.floor(by),
    dx = bx - ax,
    dy = by - ay,
    si = Math.sign(ei - Math.floor(ax)),
    sj = Math.sign(ej - Math.floor(ay)),
    // how far along the drag (0 to 1) one whole cell is, across and up
    tdx = dx ? Math.abs(1 / dx) : Infinity,
    tdy = dy ? Math.abs(1 / dy) : Infinity;
  let i = Math.floor(ax),
    j = Math.floor(ay),
    // how far along the drag the next cell edge across, and up, is
    tx = si > 0 ? (i + 1 - ax) * tdx : si < 0 ? (ax - i) * tdx : Infinity,
    ty = sj > 0 ? (j + 1 - ay) * tdy : sj < 0 ? (ay - j) * tdy : Infinity;
  const at = (): Point => [Math.round(i * step * 20) / 20, Math.round(j * step * 20) / 20],
    out = [at()];
  while (i !== ei || j !== ej) {
    if (j === ej || (i !== ei && tx < ty)) {
      i += si;
      tx += tdx;
    } else {
      j += sj;
      ty += tdy;
    }
    out.push(at());
  }
  return out;
}

// One cell of a paint stroke, with every rule a tap has: the start and finish margins, the object
// and coin caps, one piece of a kind (zone and trigger, or anything else) per cell and layer, and
// validateLevel (the ceiling). The piece is added only when it is "placed".
export type Paint = "placed" | "taken" | "outside" | "full" | "coins" | "invalid";
export const MAX_OBJECTS = 600;
export function paintCell(level: Level, piece: Piece): Paint {
  const area = buildBounds(level);
  if (piece.x < area.left || piece.x > area.right) return "outside";
  if (level.objects.length >= MAX_OBJECTS) return "full";
  if (piece.type === "coin" && coinCount(level) >= MAX_COINS) return "coins";
  const over = (type: string) => ZONES.includes(type) || TRIGGERS.includes(type),
    zone = over(piece.type);
  if (
    level.objects.some(
      (o) => o.layer === piece.layer && o.x === piece.x && o.y === piece.y && over(o.type) === zone,
    )
  )
    return "taken";
  try {
    // the piece on its own: every rule that is not a cap is a rule of the piece, and the caps are
    // checked above, so the level stays valid
    validateLevel({ ...level, objects: [piece] });
  } catch {
    return "invalid";
  }
  level.objects.push(piece);
  return "placed";
}

// Every piece on the layer that the stretch of the drag from a to b passes over (a strip a tenth
// of a block wide), removed; how many went.
export function eraseAlong(level: Level, a: Point, b: Point, layer?: string) {
  const r = 0.05,
    len = Math.hypot(b[0] - a[0], b[1] - a[1]),
    [ux, uy] = len ? [(b[0] - a[0]) / len, (b[1] - a[1]) / len] : [1, 0],
    [nx, ny] = [-uy * r, ux * r],
    [px, py] = [ux * r, uy * r],
    strip: Point[] = [
      [a[0] - px - nx, a[1] - py - ny],
      [b[0] + px - nx, b[1] + py - ny],
      [b[0] + px + nx, b[1] + py + ny],
      [a[0] - px + nx, a[1] - py + ny],
    ],
    before = level.objects.length;
  level.objects = level.objects.filter(
    (o) => o.layer !== layer || !parts(o).some((part) => intersects(strip, part)),
  );
  return before - level.objects.length;
}

// The editor's history, strokes only: one stroke that changed something is one step, holding the
// pieces and the selection from before and after it. A new stroke drops what could be redone. Any
// other edit clears it (App.svelte saveDraft), and a step only applies to the pieces it left, so an
// older stroke can never undo an edit it did not make.
export interface Step {
  before: Piece[];
  after: Piece[];
  groupBefore: number[];
  groupAfter: number[];
}
const same = (a: Piece[], b: Piece[]) => JSON.stringify(a) === JSON.stringify(b);
export class StrokeHistory {
  done: Step[] = [];
  undone: Step[] = [];
  limit: number;
  constructor(limit = 30) {
    this.limit = limit;
  }
  push(step: Step) {
    if (same(step.before, step.after)) return false;
    this.done.push(structuredClone(step));
    if (this.done.length > this.limit) this.done.shift();
    this.undone = [];
    return true;
  }
  clear() {
    this.done = [];
    this.undone = [];
  }
  // the step to take back (put its before back), if the pieces are still the ones it left
  undo(current: Piece[]) {
    const step = this.done.at(-1);
    if (!step) return null;
    if (!same(current, step.after)) return this.miss();
    this.undone.push(this.done.pop()!);
    return step;
  }
  // the step to take again (put its after back), if the pieces are still the ones undo left
  redo(current: Piece[]) {
    const step = this.undone.at(-1);
    if (!step) return null;
    if (!same(current, step.before)) return this.miss();
    this.done.push(this.undone.pop()!);
    return step;
  }
  private miss() {
    this.clear();
    return null;
  }
}
