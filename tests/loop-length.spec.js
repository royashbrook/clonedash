import { test, expect } from "./quiet.mjs";

// Loops from 8 to 32 steps in the loop maker (#140, docs/loops.md), both engines unless noted.
const LOOPS = "clonedash.loops.v1";
const cell = (page, n, step) => page.getByRole("button", { name: `note ${n} step ${step}`, exact: true });
const columns = (page) => page.locator("#loop-grid .loop-row.steps b").count();
async function open(page, width = 1280, height = 900) {
  await page.setViewportSize({ width, height });
  await page.goto("/");
  await page.locator("#loops-open").click();
  await page.locator("#new-loop").click();
}

test("a new loop is 8 steps; growing adds silent steps; a cut that loses notes asks, KEEP IT keeps them", async ({ page }) => {
  await open(page);
  expect(await columns(page)).toBe(8);
  await expect(page.locator("#loop-length-8")).toHaveAttribute("aria-pressed", "true");
  const before = await page.locator("#loop-grid .cell[aria-pressed=true]").evaluateAll((all) => all.map((c) => c.getAttribute("aria-label")));
  await page.locator("#loop-length-16").click();
  expect(await columns(page)).toBe(16);
  const after = await page.locator("#loop-grid .cell[aria-pressed=true]").evaluateAll((all) => all.map((c) => c.getAttribute("aria-label")));
  expect(after).toEqual(before);
  await cell(page, 5, 12).click();
  await page.locator("#loop-length-8").click();
  const sheet = page.locator("#sheet");
  await expect(sheet).toContainText("Cut the loop to 8 steps?");
  await sheet.getByRole("button", { name: "KEEP IT", exact: true }).click();
  expect(await columns(page)).toBe(16);
  await expect(cell(page, 5, 12)).toHaveAttribute("aria-pressed", "true");
  await page.locator("#loop-length-8").click();
  await sheet.getByRole("button", { name: "CUT TO 8", exact: true }).click();
  expect(await columns(page)).toBe(8);
  // a cut that loses nothing does not ask
  await page.locator("#loop-length-32").click();
  await page.locator("#loop-length-16").click();
  await expect(sheet).toBeHidden();
  expect(await columns(page)).toBe(16);
});

test("a 24 step loop saves, reloads and shares as a code that imports exactly", async ({ page, browser, baseURL }) => {
  await open(page);
  await page.locator("#loop-length-24").click();
  await cell(page, 5, 20).click();
  await page.locator("#loop-name").fill("Long one");
  await page.locator("#save-loop").click();
  const stored = await page.evaluate((k) => JSON.parse(localStorage.getItem(k)).loops.at(-1).loop, LOOPS);
  expect(stored.notes).toHaveLength(24);
  await page.reload();
  expect((await page.evaluate((k) => JSON.parse(localStorage.getItem(k)).loops.at(-1).loop, LOOPS)).notes).toHaveLength(24);
  const { encodeLoop } = await import("../src/loop.ts");
  const code = await encodeLoop(stored);
  const other = await browser.newContext({ baseURL });
  const b = await other.newPage();
  await b.goto("/#loop=" + code);
  await b.locator("#add-loop, #sheet button:has-text('ADD')").first().click();
  await expect.poll(() => b.evaluate((k) => JSON.parse(localStorage.getItem(k) ?? "null")?.loops.at(-1)?.loop.notes.length, LOOPS)).toBe(24);
  await other.close();
});

test("PLAY wraps at the loop's length: the playhead reaches step 16, then starts again at 1", async ({ page }) => {
  await open(page);
  await page.locator("#loop-length-16").click();
  await page.locator("#loop-play").click();
  const now = () => page.locator("#loop-grid .loop-row.steps b.now").textContent();
  await expect.poll(now, { timeout: 8000 }).toBe("16");
  await expect.poll(now, { timeout: 4000 }).toBe("1");
  await page.locator("#loop-play").click();
});

test("a long loop as a level's song: the looping buffer is whole passes, 25.6 s at 16 steps and 38.4 s at 24", async ({ page }) => {
  await page.addInitScript(() => {
    window.loops = [];
    const start = AudioBufferSourceNode.prototype.start;
    AudioBufferSourceNode.prototype.start = function (...a) { if (this.loop && this.buffer) window.loops.push(this.buffer.duration); return start.apply(this, a); };
  });
  for (const [n, seconds] of [[16, 25.6], [24, 38.4]]) {
    await open(page);
    await page.locator(`#loop-length-${n}`).click();
    await page.locator("#loop-name").fill(`L${n}`);
    await page.locator("#save-loop").click();
    await page.locator("#loop-done").click();
    await page.locator("#loops-back").click();
    await page.locator("#sound").click();
    await page.locator("#my-levels").click();
    await page.locator("#new-level").click();
    await page.locator("#level-settings").click();
    await page.locator("#level-song").selectOption({ label: `L${n}` });
    await page.locator("#sheet-close").click();
    await page.locator("#test-level").click();
    await expect.poll(() => page.evaluate(() => window.loops.at(-1)), { timeout: 30000 }).toBeCloseTo(seconds, 3);
  }
});

test("a phone with swipe on: the step numbers drag a 32 step grid sideways, and the late steps paint", async ({ browser, baseURL, browserName }) => {
  test.skip(browserName !== "chromium", "touch is driven through Chromium's devtools input");
  const context = await browser.newContext({ baseURL, hasTouch: true, isMobile: true, viewport: { width: 420, height: 912 } });
  const page = await context.newPage();
  await page.goto("/");
  await page.locator("#loops-open").click();
  await page.locator("#new-loop").click();
  await page.locator("#loop-length-32").click();
  await page.locator("#loop-swipe").click();
  const box = page.locator(".loop-grid-box");
  await box.scrollIntoViewIfNeeded();
  const cdp = await context.newCDPSession(page);
  const touch = (type, pts) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints: pts.map(([x, y]) => ({ x, y })) });
  const head = await page.locator("#loop-grid .loop-row.steps b").nth(6).boundingBox();
  const y = head.y + head.height / 2;
  for (let round = 0; round < 3; round++) {
    await touch("touchStart", [[head.x + 20, y]]);
    for (let i = 1; i <= 10; i++) await touch("touchMove", [[head.x + 20 - i * 30, y]]);
    await touch("touchEnd", []);
  }
  await expect.poll(() => box.evaluate((e) => e.scrollLeft)).toBeGreaterThan(400);
  // step 30 is now on screen: a stroke on it paints
  const target = await cell(page, 5, 30).boundingBox();
  const at = [target.x + target.width / 2, target.y + target.height / 2];
  await touch("touchStart", [at]);
  await touch("touchMove", [[at[0] + 46, at[1]]]);
  await touch("touchEnd", []);
  await expect(cell(page, 5, 30)).toHaveAttribute("aria-pressed", "true");
  await expect(cell(page, 5, 31)).toHaveAttribute("aria-pressed", "true");
  await context.close();
});
