import { test, expect } from "./quiet.mjs";

// A phone held upright plays (#138). The rules are in docs/portrait.md: the shape is read fresh, only
// the level editor asks to turn the phone, a turn mid-run pauses it where it is, zoom lives in the
// pause sheet, and the framing eases across a turn. Both engines.
const UP = { width: 390, height: 844 },
  SIDE = { width: 844, height: 390 };
const progress = (page) => page.locator("#run-progress").evaluate((e) => e.value);
const framing = (page) => page.locator("#world").evaluate((e) => e.dataset.framing);
// scrolled into view, the element at a control's centre is the control or inside it: nothing lies over it
async function reachable(locator) {
  await locator.scrollIntoViewIfNeeded();
  return locator.evaluate((e) => { const r = e.getBoundingClientRect(); return e.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)); });
}
// an empty custom trail, so an idle cube never dies and progress only climbs; built sideways, as the editor asks
async function openRoad(page, viewport) {
  await page.setViewportSize(SIDE);
  await page.goto("/");
  await page.locator("#my-levels").click();
  await page.locator("#new-level").click();
  await page.locator("#level-title").fill("Open road");
  await page.locator("#level-title").blur();
  await page.locator("#level-length").fill("200");
  await page.locator("#level-length").blur();
  await page.locator("#editor-back").click();
  await expect(page.locator("#library")).toBeVisible();
  await page.setViewportSize(viewport);
  await page.clock.runFor(50);
}
async function play(page) {
  await page.getByRole("button", { name: "Play Open road", exact: true }).click();
  await page.clock.runFor(1500);
}
const sheet = (page) => page.locator("#sheet");
const button = (page, name) => sheet(page).getByRole("button", { name, exact: true });

test("upright from the start: the menus take taps, a run plays, zoom is in the pause sheet only", async ({ page }) => {
  await page.clock.install();
  await page.setViewportSize(UP);
  await page.goto("/");
  await page.clock.runFor(100);
  await expect(page.locator("#rotate")).toBeHidden();
  for (const b of [page.getByRole("button", { name: "Play First Spark", exact: true }), page.locator("#my-levels")]) expect(await reachable(b)).toBe(true);
  await page.getByRole("button", { name: "Play First Spark", exact: true }).click();
  await expect(page.locator("#rotate")).toBeHidden();
  // the look-ahead grows from nothing at the start line to its full block and a half
  for (let i = 0; i < 40 && (await framing(page)) !== "1.50 1.00"; i++) await page.clock.runFor(50);
  expect(await framing(page)).toBe("1.50 1.00");
  await page.locator("#pause").click();
  await button(page, "ZOOM IN (SEE BIGGER)").click();
  await button(page, "ZOOM IN (SEE BIGGER)").click();
  await page.clock.runFor(50);
  expect(await framing(page), "a zoom tap snaps").toBe("1.50 1.20");
  await button(page, "RESUME").click();
  await page.clock.runFor(300);
  expect(await framing(page), "zoom holds on resume").toBe("1.50 1.20");
  // the pause menu leaves for the main menu, which takes taps
  await page.locator("#pause").click();
  await button(page, "MAIN MENU").click();
  await expect(page.locator("#home")).toBeVisible();
  expect(await reachable(page.getByRole("button", { name: "Play First Spark", exact: true }))).toBe(true);
});

for (const [from, to] of [[SIDE, UP], [UP, SIDE]])
  test(`a turn mid-run pauses it where it is, then it plays on: ${from.width > from.height ? "sideways to upright" : "upright to sideways"}`, async ({ page }) => {
    await page.clock.install();
    await openRoad(page, from);
    await play(page);
    const before = await progress(page);
    expect(before).toBeGreaterThan(0);
    await page.setViewportSize(to);
    await page.clock.runFor(50);
    await expect(sheet(page)).toContainText("Paused");
    await expect(page.locator("#rotate")).toBeHidden();
    // the zoom buttons follow the shape
    await expect(button(page, "ZOOM IN (SEE BIGGER)")).toHaveCount(to.height > to.width ? 1 : 0);
    const held = await progress(page);
    expect(held).toBeGreaterThanOrEqual(before);
    await page.clock.runFor(700);
    expect(await progress(page), "frozen while paused").toBe(held);
    // turning back under the pause sheet rebuilds it
    await page.setViewportSize(from);
    await page.clock.runFor(50);
    await expect(sheet(page)).toContainText("Paused");
    await expect(button(page, "ZOOM IN (SEE BIGGER)")).toHaveCount(from.height > from.width ? 1 : 0);
    await page.setViewportSize(to);
    await page.clock.runFor(50);
    await button(page, "RESUME").click();
    await page.clock.runFor(700);
    expect(await progress(page), "plays on from the same spot").toBeGreaterThan(held);
    await expect(page.locator("#rotate")).toBeHidden();
    // and leaves through its pause menu for a library that takes taps
    await page.locator("#pause").click();
    await button(page, "MY LEVELS").click();
    await expect(page.locator("#library")).toBeVisible();
    expect(await reachable(page.getByRole("button", { name: "Play Open road", exact: true }))).toBe(true);
  });

test("a turn with no resize event still counts: the run pauses and the editor asks", async ({ page }) => {
  // the game never hears a resize: a phone that skips it, or sends it before the sizes change. its
  // listener is dropped as it registers (a capture listener cannot stop it: chromium runs listeners
  // at the window in the order they were added)
  await page.addInitScript(() => {
    const add = window.addEventListener.bind(window);
    window.addEventListener = (type, ...rest) => (type === "resize" ? undefined : add(type, ...rest));
  });
  await page.clock.install();
  await openRoad(page, SIDE);
  await play(page);
  await page.setViewportSize(UP);
  await page.clock.runFor(50);
  await expect(sheet(page)).toContainText("Paused");
  await button(page, "MY LEVELS").click();
  await page.setViewportSize(SIDE);
  await page.clock.runFor(50);
  await page.getByRole("button", { name: "Edit Open road", exact: true }).click();
  await expect(page.locator("#rotate")).toBeHidden();
  await page.setViewportSize(UP);
  await page.clock.runFor(50);
  await expect(page.locator("#rotate")).toBeVisible();
  await page.setViewportSize(SIDE);
  await page.clock.runFor(50);
  await expect(page.locator("#rotate")).toBeHidden();
});

test("the level editor is the one screen that asks to turn; MY LEVELS leaves it for a library that takes taps", async ({ page }) => {
  await page.clock.install();
  await openRoad(page, UP);
  await page.locator("#dock").getByRole("button", { name: /PLAY/ }).click();
  await page.locator("#editor-open").click();
  await expect(page.locator("#rotate")).toBeVisible();
  await expect(page.locator("#rotate")).toContainText("Turn sideways to build");
  await page.locator("#rotate-menu").click();
  await expect(page.locator("#library")).toBeVisible();
  await expect(page.locator("#rotate")).toBeHidden();
  for (const b of [page.locator("#new-level"), page.getByRole("button", { name: "Play Open road", exact: true }), page.locator("#dock [aria-current=page]")]) expect(await reachable(b)).toBe(true);
  // sideways in the editor, turn upright and back: the editor is usable again
  await page.setViewportSize(SIDE);
  await page.getByRole("button", { name: "Edit Open road", exact: true }).click();
  await expect(page.locator("#level-title")).toHaveValue("Open road");
  await page.setViewportSize(UP);
  await page.clock.runFor(50);
  await expect(page.locator("#rotate")).toBeVisible();
  await page.setViewportSize(SIDE);
  await page.clock.runFor(50);
  await expect(page.locator("#rotate")).toBeHidden();
  expect(await reachable(page.locator("#test-level"))).toBe(true);
  // its test run is a run: upright pauses it, BACK TO EDITOR returns to the editor, which asks
  await page.locator("#test-level").click();
  await page.clock.runFor(300);
  await page.setViewportSize(UP);
  await page.clock.runFor(50);
  await expect(page.locator("#rotate")).toBeHidden();
  await button(page, "BACK TO EDITOR").click();
  await expect(page.locator("#rotate")).toBeVisible();
  await page.locator("#rotate-menu").click();
  await expect(page.locator("#library")).toBeVisible();
  // and a run plays upright after all that
  await play(page);
  await expect(page.locator("#rotate")).toBeHidden();
  const a = await progress(page);
  await page.clock.runFor(500);
  expect(await progress(page)).toBeGreaterThan(a);
});

test("the framing eases across a turn, and snaps with reduced motion", async ({ browser, baseURL }) => {
  for (const reducedMotion of ["no-preference", "reduce"]) {
    const context = await browser.newContext({ baseURL, reducedMotion });
    const page = await context.newPage();
    await page.clock.install();
    await openRoad(page, SIDE);
    await play(page);
    expect(await framing(page)).toBe("0.00 1.00");
    // a turn pauses the run; the framing eases behind the pause sheet
    await page.setViewportSize(UP);
    await page.clock.runFor(32);
    const mid = await framing(page);
    if (reducedMotion === "reduce") expect(mid).toBe("1.50 1.00");
    else {
      const lead = parseFloat(mid);
      expect(lead, `part way: ${mid}`).toBeGreaterThan(0);
      expect(lead, `part way: ${mid}`).toBeLessThan(1.5);
    }
    await page.clock.runFor(1000);
    expect(await framing(page)).toBe("1.50 1.00");
    await context.close();
  }
});
