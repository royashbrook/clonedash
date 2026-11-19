import { test, expect } from "./quiet.mjs";

// SWIPE NOTES in the loop maker (#139): off, nothing changes from before; on, a stroke paints or
// erases what it crosses, once per cell, decided by the first cell.
const cell = (page, n, step) => page.getByRole("button", { name: `note ${n} step ${step}`, exact: true });
const pressed = (page, n, steps) => Promise.all(steps.map((s) => cell(page, n, s).getAttribute("aria-pressed")));
async function centre(page, n, step) {
  const b = await cell(page, n, step).boundingBox();
  return [b.x + b.width / 2, b.y + b.height / 2];
}
async function stroke(page, points, steps = 6) {
  const [first, ...rest] = points;
  await page.mouse.move(...first);
  await page.mouse.down();
  for (const p of rest) await page.mouse.move(...p, { steps });
  await page.mouse.up();
}
async function open(page) {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/");
  await page.locator("#loops-open").click();
  await page.locator("#new-loop").click();
  // a new loop starts from a preset: clear its notes so every cell below starts empty
  await page.locator("#loop-clear").click();
  await page.locator("#sheet").getByRole("button", { name: "CLEAR NOTES", exact: true }).click();
  await expect(page.locator("#loop-grid .cell[data-kind=note][aria-pressed=true]")).toHaveCount(0);
}

test("off: a drag across cells changes nothing, a tap still toggles one", async ({ page }) => {
  await open(page);
  await expect(page.locator("#loop-swipe")).toHaveAttribute("aria-pressed", "false");
  await stroke(page, [await centre(page, 5, 1), await centre(page, 5, 4)]);
  expect(await pressed(page, 5, [1, 2, 3, 4])).toEqual(["false", "false", "false", "false"]);
  await cell(page, 5, 2).click();
  expect(await pressed(page, 5, [1, 2, 3])).toEqual(["false", "true", "false"]);
});

test("on: a stroke from an empty cell paints every cell it crosses, once, even crossing back", async ({ page }) => {
  await open(page);
  await page.locator("#loop-swipe").click();
  await expect(page.locator("#loop-swipe")).toHaveAttribute("aria-pressed", "true");
  await stroke(page, [await centre(page, 5, 1), await centre(page, 5, 4), await centre(page, 5, 2)]);
  expect(await pressed(page, 5, [1, 2, 3, 4, 5])).toEqual(["true", "true", "true", "true", "false"]);
});

test("on: a stroke from a filled cell erases, and leaves empty cells empty", async ({ page }) => {
  await open(page);
  for (const s of [1, 2, 4]) await cell(page, 5, s).click();
  await page.locator("#loop-swipe").click();
  await stroke(page, [await centre(page, 5, 1), await centre(page, 5, 5)]);
  expect(await pressed(page, 5, [1, 2, 3, 4, 5])).toEqual(["false", "false", "false", "false", "false"]);
});

test("on: one fast jump still paints the cells in between, and moving after release paints nothing", async ({ page }) => {
  await open(page);
  await page.locator("#loop-swipe").click();
  await stroke(page, [await centre(page, 5, 1), await centre(page, 5, 6)], 1);
  expect(await pressed(page, 5, [1, 2, 3, 4, 5, 6])).toEqual(Array(6).fill("true"));
  await page.mouse.move(...(await centre(page, 6, 1)));
  await page.mouse.move(...(await centre(page, 6, 6)), { steps: 6 });
  expect(await pressed(page, 6, [1, 2, 3, 4, 5, 6])).toEqual(Array(6).fill("false"));
});

test("a finger: a touch swipe paints, and a cancelled touch ends the stroke", async ({ browser, baseURL, browserName }) => {
  test.skip(browserName !== "chromium", "touch is driven through Chromium's devtools input");
  const context = await browser.newContext({ baseURL, hasTouch: true, isMobile: true, viewport: { width: 420, height: 912 } });
  const page = await context.newPage();
  await page.goto("/");
  await page.locator("#loops-open").click();
  await page.locator("#new-loop").click();
  await page.locator("#loop-clear").click();
  await page.locator("#sheet").getByRole("button", { name: "CLEAR NOTES", exact: true }).click();
  await page.locator("#loop-swipe").click();
  await cell(page, 5, 1).scrollIntoViewIfNeeded();
  const cdp = await context.newCDPSession(page);
  const touch = (type, [x, y]) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints: type === "touchEnd" || type === "touchCancel" ? [] : [{ x, y }] });
  const a = await centre(page, 5, 1), b = await centre(page, 5, 3);
  await touch("touchStart", a);
  for (let i = 1; i <= 6; i++) await touch("touchMove", [a[0] + ((b[0] - a[0]) * i) / 6, a[1]]);
  await touch("touchEnd", b);
  expect(await pressed(page, 5, [1, 2, 3, 4])).toEqual(["true", "true", "true", "false"]);
  // a cancel (the system took the touch) ends the stroke: the next moves paint nothing
  const c = await centre(page, 6, 1), d = await centre(page, 6, 3);
  await touch("touchStart", c);
  await touch("touchCancel", c);
  await cdp.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: d[0], y: d[1] });
  expect(await pressed(page, 6, [1, 2, 3])).toEqual(["true", "false", "false"]);
  await context.close();
});

test("on: drums paint too, and a keyboard press still toggles one cell", async ({ page }) => {
  await open(page);
  await page.locator("#loop-swipe").click();
  const drum = (s) => page.getByRole("button", { name: `kick step ${s}`, exact: true });
  const at = async (s) => { const b = await drum(s).boundingBox(); return [b.x + b.width / 2, b.y + b.height / 2]; };
  await stroke(page, [await at(2), await at(3)]);
  expect(await Promise.all([2, 3].map((s) => drum(s).getAttribute("aria-pressed")))).toEqual(["true", "true"]);
  // a plain tap is a one-cell stroke: it sets that cell once, its click does not undo it
  await cell(page, 4, 2).click();
  await expect(cell(page, 4, 2)).toHaveAttribute("aria-pressed", "true");
  await cell(page, 3, 7).focus();
  await page.keyboard.press("Enter");
  await expect(cell(page, 3, 7)).toHaveAttribute("aria-pressed", "true");
});
