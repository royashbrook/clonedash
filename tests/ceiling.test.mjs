import test from "node:test";
import assert from "node:assert/strict";
import { canvasLog } from "./canvas-log.mjs";

const screen = { width: 390, height: 844 };
function draw(height, cameraY, zoom) {
  const { view, log } = canvasLog({ level: { length: 40, height, objects: [] },
    state: null, showCeiling: true, view: screen, zoom, cameraY });
  return log.filter(([op, x, y, w, h]) =>
    op === "fillRect" && x === 0 && w === screen.width && h === 2 && y >= 0 && y < screen.height)
    .map(([, , y]) => view.y(y + 2));
}
test("the top edge tracks the playable ceiling through portrait zoom and camera travel", () => {
  for (const [height, cameraY, zoom] of [[7, 0, 1], [7, 1, 1.2], [1000, 994, 0.8]]) {
    assert.ok(draw(height, cameraY, zoom).some(y => Math.abs(y - height) < 1e-8));
  }
  assert.equal(draw(1000, 0, 1).length, 1, "only the floor is visible at the foot of a tall trail");
});
