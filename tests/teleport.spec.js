import { test, expect } from "./quiet.mjs";

// Teleports in the editor and in play (#139, docs/teleport.md). Both engines.
const stored = (page) => page.evaluate(() => JSON.parse(localStorage.getItem("clonedash.v1")));
const piece = (type, x, y = 0, extra = {}) => ({ type, x, y, rotation: 0, flipX: false, flipY: false, ...extra });
const seed = (page, objects, length = 80) => page.addInitScript(([objects, length]) => {
  if (!localStorage.getItem("clonedash.v1")) localStorage.setItem("clonedash.v1", JSON.stringify({ version: 1, best: {}, sound: false, draft: { name: "Teleports", length, objects } }));
}, [objects, length]);
const grid = async (page) => {
  const point = await page.evaluate(() => {
    const top = document.querySelector(".editor-head").getBoundingClientRect().bottom;
    const floor = document.querySelector(".editor-controls").getBoundingClientRect().top - 18;
    return { unit: Math.max(12, Math.min((floor - top - 14) / 7, innerWidth / 13.5, 82)), floor };
  });
  return (x, y) => page.mouse.click((x + 0.1) * point.unit, point.floor - (y + 0.5) * point.unit);
};
// the run's x from the progress bar, as in cube.spec.js
const runX = (page, length) => page.locator("#run-progress").evaluate((e, length) => 1 + (e.value / 100) * (length - 1), length);

test("the TELEPORT trigger and the TELEPORT RING: placed, aimed with EDIT OBJECT, and shown on the status line", async ({ page }) => {
  await seed(page, []);
  await page.goto("/");
  await page.locator("#editor-open").click();
  const cell = await grid(page);
  await page.getByRole("tab", { name: "TRIGGERS", exact: true }).click();
  await page.getByRole("button", { name: "⇥ TELEPORT", exact: true }).click();
  await cell(5, 0);
  await expect(page.locator("#selection")).toContainText("TELEPORT TRIGGER");
  await expect(page.locator("#selection")).toContainText("GROUP 1 · TELEPORT");
  await expect(page.locator("#selection")).not.toContainText("INSTANT");
  await page.locator("#edit-object").click();
  const sheet = page.locator("dialog");
  await expect(sheet.locator("#trigger-target")).toHaveValue("1");
  await expect(sheet.locator("#trigger-time")).toHaveCount(0); // a teleport is instant
  await expect(sheet.locator("#trigger-color")).toHaveCount(0);
  await sheet.locator("#trigger-target").fill("3");
  await sheet.locator("#trigger-target").dispatchEvent("change");
  await sheet.getByRole("button", { name: "DONE" }).click();
  await page.getByRole("tab", { name: "RINGS", exact: true }).click();
  await page.getByRole("button", { name: "⇥ VIOLET · TELEPORT", exact: true }).click();
  await cell(8, 1);
  await expect(page.locator("#selection")).toContainText("TELEPORT RING");
  await expect(page.locator("#selection")).toContainText("TO GROUP 1");
  await page.locator("#edit-object").click();
  await sheet.locator("#ring-target").fill("5");
  await sheet.locator("#ring-target").dispatchEvent("change");
  await expect(sheet.locator("#group-id")).toBeVisible(); // a ring can also be a landing spot
  await sheet.getByRole("button", { name: "DONE" }).click();
  await expect(page.locator("#selection")).toContainText("TO GROUP 5");
  expect((await stored(page)).draft.objects).toEqual([
    piece("teleport-trigger", 5, 0, { target: 3 }),
    piece("teleport-ring", 8, 1, { target: 5, color: "#b388ff" }),
  ]);
});

test("in play, a teleport trigger sends the run to its group's landing spot", async ({ page }) => {
  await page.clock.install();
  await seed(page, [piece("teleport-trigger", 5, 0, { target: 1 }), piece("block", 60, 0, { noTouch: true, group: 1 })]);
  await page.goto("/");
  await page.locator("#editor-open").click();
  await page.locator("#test-level").click();
  await page.clock.runFor(800);
  expect(await runX(page, 80)).toBeLessThan(5);
  await page.clock.runFor(1500);
  const x = await runX(page, 80);
  expect(x, `landed at 60 and ran on: ${x}`).toBeGreaterThan(60);
  expect(x).toBeLessThan(70);
});
