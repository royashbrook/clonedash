import { test, expect, tool } from "./quiet.mjs";

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
async function open(page, desktop = true) {
  if (desktop) await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/");
  await page.locator("#loops-open").click();
  await page.locator("#new-loop").click();
  // a new loop starts from a preset: clear its notes so every cell below starts empty
  await tool(page, "#loop-clear");
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
  await tool(page, "#loop-clear");
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

// a phone, driven through Chromium's devtools touch input: several fingers at once
async function phone(browser, baseURL, width) {
  const context = await browser.newContext({ baseURL, hasTouch: true, isMobile: true, viewport: { width, height: 800 } });
  const page = await context.newPage();
  await open(page, false);
  const cdp = await context.newCDPSession(page);
  // fingers: [[id, [x, y]], ...]; each event carries every finger still down, so a finger lifts by
  // leaving the next touchMove, and touchEnd (no fingers) lifts the rest
  const touch = (type, fingers) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints: fingers.map(([id, [x, y]]) => ({ id, x, y })) });
  return { context, page, touch, cdp };
}

test("a second finger neither steers, erases nor ends the first finger's stroke", async ({ browser, baseURL, browserName }) => {
  test.skip(browserName !== "chromium", "touch is driven through Chromium's devtools input");
  const { context, page, touch, cdp } = await phone(browser, baseURL, 420);
  await cell(page, 6, 5).click(); // a filled cell for the second finger
  await page.locator("#loop-swipe").click();
  await cell(page, 5, 1).scrollIntoViewIfNeeded();
  const a1 = await centre(page, 5, 1), a3 = await centre(page, 5, 3), a4 = await centre(page, 5, 4);
  const b = await centre(page, 6, 5), c1 = await centre(page, 6, 2), c2 = await centre(page, 6, 3);
  const mid = (p, q, t) => [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t];
  const am = mid(a1, a3, 0.5);
  await touch("touchStart", [[0, a1]]); // A starts painting
  await touch("touchMove", [[0, am]]);
  await touch("touchStart", [[0, am], [1, b]]); // B taps a filled cell and lifts
  await touch("touchEnd", [[1, b]]);
  await touch("touchMove", [[0, a3]]);
  await touch("touchStart", [[0, a3], [2, c1]]); // C lands on an empty cell, drags and lifts
  await touch("touchMove", [[0, a3], [2, c2]]);
  await touch("touchEnd", [[2, c2]]);
  // a mouse click on the filled cell while A still paints: a pointer the stroke ignores, and its
  // click on a cell must not toggle it either
  for (const type of ["mousePressed", "mouseReleased"])
    await cdp.send("Input.dispatchMouseEvent", { type, x: b[0], y: b[1], button: "left", clickCount: 1 });
  await touch("touchMove", [[0, a4]]); // A carries on
  await touch("touchEnd", []);
  expect(await pressed(page, 5, [1, 2, 3, 4, 5])).toEqual(["true", "true", "true", "true", "false"]);
  expect(await pressed(page, 6, [1, 2, 3, 4, 5, 6])).toEqual(["false", "false", "false", "false", "true", "false"]);
  await context.close();
});

// the phone layout (#140): the 8 steps fit a 320px phone, so nothing scrolls sideways, and with swipe
// off a finger drag across them changes no note
test("swipe off on a narrow phone: all 8 steps are on screen and a finger drag changes no note", async ({ browser, baseURL, browserName }) => {
  test.skip(browserName !== "chromium", "touch is driven through Chromium's devtools input");
  const { context, page, touch } = await phone(browser, baseURL, 320);
  const box = page.locator(".loop-grid-box");
  expect(await box.evaluate((e) => e.scrollWidth <= e.clientWidth), "no sideways scroll").toBe(true);
  for (const s of [1, 8]) {
    const r = await cell(page, 5, s).boundingBox();
    expect(r.x).toBeGreaterThanOrEqual(0);
    expect(r.x + r.width).toBeLessThanOrEqual(320);
  }
  const a = await centre(page, 5, 1), b = await centre(page, 5, 8);
  await touch("touchStart", [[0, a]]);
  for (let i = 1; i <= 10; i++) await touch("touchMove", [[0, [a[0] + ((b[0] - a[0]) * i) / 10, a[1]]]]);
  await touch("touchEnd", []);
  await expect(page.locator("#loop-grid .cell[data-kind=note][aria-pressed=true]")).toHaveCount(0);
  await context.close();
});

test("on: a stroke that loses its pointer ends there", async ({ page, browserName }) => {
  test.skip(browserName !== "chromium", "WebKit reports no capture for this mouse, so there is none to take away");
  await open(page);
  await page.locator("#loop-swipe").click();
  await page.evaluate(() => {
    const grid = document.querySelector("#loop-grid");
    grid.addEventListener("gotpointercapture", (e) => (window.captured = e.pointerId));
  });
  const [x1, y1] = await centre(page, 5, 1);
  await page.mouse.move(x1, y1);
  await page.mouse.down();
  // a capture takes hold at the next pointer event: nudge within the first cell, wait for it
  await page.mouse.move(x1 + 2, y1);
  await expect.poll(() => page.evaluate(() => window.captured)).not.toBeUndefined();
  // the system takes the pointer away mid-stroke (no pointerup)
  await page.evaluate(() => document.querySelector("#loop-grid").releasePointerCapture(window.captured));
  await page.mouse.move(...(await centre(page, 5, 4)), { steps: 6 });
  await page.mouse.up();
  expect(await pressed(page, 5, [1, 2, 3, 4])).toEqual(["true", "false", "false", "false"]);
});

test("on: a right-button press starts no stroke", async ({ page }) => {
  await open(page);
  await page.locator("#loop-swipe").click();
  await page.mouse.move(...(await centre(page, 5, 1)));
  await page.mouse.down({ button: "right" });
  await page.mouse.move(...(await centre(page, 5, 4)), { steps: 6 });
  await page.mouse.up({ button: "right" });
  expect(await pressed(page, 5, [1, 2, 3, 4])).toEqual(["false", "false", "false", "false"]);
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
