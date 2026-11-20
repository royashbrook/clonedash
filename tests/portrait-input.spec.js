import { test, expect } from "./quiet.mjs";

// A turn ends every editor gesture where it stands (#138, docs/portrait.md rule 3): a SWIPE stroke
// keeps only what it painted before the turn, a pinch keeps and saves its last good shape, a MULTI
// box is dropped, and a finger from before the turn counts again only when it comes down fresh.
// Both engines; pointers are a real mouse or pointer events with their own ids, as in pinch.spec.js.
const UP = { width: 390, height: 844 },
  SIDE = { width: 844, height: 390 };
const stored = (page) => page.evaluate(() => JSON.parse(localStorage.getItem("clonedash.v1")));
const finger = (page, type, id, x, y) => page.locator("#world").evaluate((c, o) => {
  c.dispatchEvent(new PointerEvent(o.type, { pointerId: o.id, pointerType: "touch", isPrimary: o.id === 1, clientX: o.x, clientY: o.y, bubbles: true }));
}, { type, id, x, y });
function seed(page, objects) {
  return page.addInitScript((objects) => {
    if (!localStorage.getItem("clonedash.v1")) localStorage.setItem("clonedash.v1", JSON.stringify({ version: 1, best: {}, sound: false, draft: { name: "Turn", length: 40, height: 12, objects } }));
  }, objects);
}
// the editor grid: a cell's centre on screen
const grid = (page) => page.evaluate(() => {
  const top = document.querySelector(".editor-head").getBoundingClientRect().bottom;
  const floor = document.querySelector(".editor-controls").getBoundingClientRect().top - 18;
  const unit = Math.max(12, Math.min((floor - top - 14) / 7, innerWidth / 13.5, 82));
  return { unit, floor };
});
const at = (g, x, y) => [(x + 0.5) * g.unit, g.floor - (y + 0.5) * g.unit];

test("a SWIPE stroke held across a turn keeps only the cell it painted before the turn", async ({ page }) => {
  await seed(page, []);
  await page.setViewportSize(SIDE);
  await page.goto("/");
  await page.locator("#editor-open").click();
  await page.locator("#swipe-tool").click();
  const g = await grid(page);
  await page.mouse.move(...at(g, 4, 0));
  await page.mouse.down();
  await page.setViewportSize(UP);
  await expect(page.locator("#rotate")).toBeVisible();
  await page.mouse.move(260, 400, { steps: 5 });
  await page.mouse.up();
  await page.setViewportSize(SIDE);
  await expect(page.locator("#rotate")).toBeHidden();
  // one cell, the one under the pointer when it came down (the move after the turn paints nothing)
  await expect.poll(async () => (await stored(page)).draft.objects.length).toBe(1);
  expect((await stored(page)).draft.objects[0].y).toBe(0);
  // and the next stroke is a fresh one: it paints
  await page.mouse.move(...at(g, 6, 0));
  await page.mouse.down();
  await page.mouse.up();
  await expect.poll(async () => (await stored(page)).draft.objects.length).toBe(2);
});

// a finger keeps its capture through a turn on a phone, so its moves still reach the canvas: sent
// straight at it, they must paint nothing either
test("a captured finger's stroke across a turn: its later moves reach the canvas and paint nothing", async ({ page }) => {
  await seed(page, []);
  await page.setViewportSize(SIDE);
  await page.goto("/");
  await page.locator("#editor-open").click();
  await page.locator("#swipe-tool").click();
  const g = await grid(page);
  const [x, y] = at(g, 6, 0);
  await finger(page, "pointerdown", 1, x, y);
  await page.setViewportSize(UP);
  await expect(page.locator("#rotate")).toBeVisible();
  for (let i = 1; i <= 6; i++) await finger(page, "pointermove", 1, x + i * 40, y - i * 30);
  await finger(page, "pointerup", 1, x + 240, y - 180);
  await page.setViewportSize(SIDE);
  await expect.poll(async () => (await stored(page)).draft.objects.length).toBe(1);
});

test("a pinch held across a turn keeps and saves its last good shape, and later moves change nothing", async ({ page }) => {
  await seed(page, [{ type: "grid", x: 8, y: 1, rotation: 0, flipX: false, flipY: false }]);
  await page.setViewportSize(SIDE);
  await page.goto("/");
  await page.locator("#editor-open").click();
  await page.locator("#select-tool").click();
  const g = await grid(page);
  const [bx, by] = at(g, 8, 1);
  await finger(page, "pointerdown", 1, bx, by);
  await expect(page.locator("#selection")).toContainText("GRID");
  await finger(page, "pointerdown", 2, bx + 100, by);
  await finger(page, "pointermove", 2, bx + 200, by);
  await expect(page.locator("#selection")).toContainText("×2.00");
  await page.setViewportSize(UP);
  await expect(page.locator("#rotate")).toBeVisible();
  // saved at the turn, before any finger lifts
  await expect.poll(async () => (await stored(page)).draft.objects[0]).toMatchObject({ scaleX: 2, scaleY: 2 });
  await finger(page, "pointermove", 2, bx + 400, by);
  await finger(page, "pointerup", 2, 0, 0);
  await finger(page, "pointerup", 1, 0, 0);
  await page.setViewportSize(SIDE);
  await expect(page.locator("#rotate")).toBeHidden();
  expect((await stored(page)).draft.objects[0]).toMatchObject({ x: 8, y: 1, scaleX: 2, scaleY: 2 });
});

test("a MULTI box held across a turn is dropped: nothing is selected by it", async ({ page }) => {
  await seed(page, [{ type: "grid", x: 8, y: 1, rotation: 0, flipX: false, flipY: false }]);
  await page.setViewportSize(SIDE);
  await page.goto("/");
  await page.locator("#editor-open").click();
  await page.locator("#multi-tool").click();
  const g = await grid(page);
  // a captured finger: its moves and lift still reach the canvas after the turn
  const [x, y] = at(g, 6, 3), [x2, y2] = at(g, 10, 0);
  await finger(page, "pointerdown", 1, x, y);
  await page.setViewportSize(UP);
  await expect(page.locator("#rotate")).toBeVisible();
  for (let i = 1; i <= 4; i++) await finger(page, "pointermove", 1, x + ((x2 - x) * i) / 4, y + ((y2 - y) * i) / 4);
  await finger(page, "pointerup", 1, x2, y2);
  await page.setViewportSize(SIDE);
  await expect(page.locator("#rotate")).toBeHidden();
  await expect(page.locator("#selection")).not.toContainText("GRID");
});

test("upright, the look-ahead starts at nothing, so the cube is on screen from the first frame", async ({ page }) => {
  await page.clock.install();
  await page.setViewportSize(UP);
  await page.goto("/");
  await page.getByRole("button", { name: "Play First Spark", exact: true }).click();
  await page.clock.runFor(16);
  const first = parseFloat(await page.locator("#world").evaluate((e) => e.dataset.framing));
  expect(first, "no lead at the start line").toBe(0);
  await page.clock.runFor(1000);
  expect(await page.locator("#world").evaluate((e) => e.dataset.framing)).toBe("1.50 1.00");
});
