import { test, expect, tool } from "./quiet.mjs";

// Loops from 8 to 32 steps in the loop maker (#140, docs/loops.md), both engines unless noted. The
// grid shows 8 steps; a longer loop's page tabs show the rest, 8 at a time.
const LOOPS = "clonedash.loops.v1";
const steps = async (page) => Math.max(1, await page.locator(".pages button").count()) * 8;
// the cell, after showing its page
async function cell(page, n, step) {
  const tab = page.locator(`#loop-page-${Math.ceil(step / 8)}`);
  if (await tab.count()) await tab.click();
  return page.getByRole("button", { name: `note ${n} step ${step}`, exact: true });
}
const pressed = (page) => page.locator("#loop-grid .cell[aria-pressed=true]").evaluateAll((all) => all.map((c) => c.getAttribute("aria-label")));
async function open(page, width = 390, height = 844) {
  await page.setViewportSize({ width, height });
  await page.goto("/");
  await page.locator("#loops-open").click();
  await page.locator("#new-loop").click();
}

test("a new loop is 8 steps; growing adds silent steps; a cut that loses notes asks, KEEP IT keeps them", async ({ page }) => {
  await open(page);
  expect(await steps(page)).toBe(8);
  await expect(page.locator(".pages")).toHaveCount(0);
  const before = await pressed(page);
  await tool(page, "#loop-length-16");
  expect(await steps(page)).toBe(16);
  await page.locator("#loop-page-1").click();
  expect(await pressed(page)).toEqual(before);
  await page.locator("#loop-page-2").click();
  expect(await pressed(page)).toEqual([]);
  await (await cell(page, 5, 12)).click();
  await tool(page, "#loop-length-8");
  const sheet = page.locator("#sheet");
  await expect(sheet).toContainText("Cut the loop to 8 steps?");
  await sheet.getByRole("button", { name: "KEEP IT", exact: true }).click();
  expect(await steps(page)).toBe(16);
  await expect(await cell(page, 5, 12)).toHaveAttribute("aria-pressed", "true");
  await tool(page, "#loop-length-8");
  await sheet.getByRole("button", { name: "CUT TO 8", exact: true }).click();
  expect(await steps(page)).toBe(8);
  // a cut that loses nothing does not ask
  await tool(page, "#loop-length-32");
  await tool(page, "#loop-length-16");
  await expect(sheet).toBeHidden();
  expect(await steps(page)).toBe(16);
});

test("a 24 step loop saves, reloads and shares as a code that imports exactly", async ({ page, browser, baseURL }) => {
  await open(page);
  await tool(page, "#loop-length-24");
  await (await cell(page, 5, 20)).click();
  await page.locator("#loop-name").fill("Long one");
  await page.locator("#save-loop").click();
  const stored = await page.evaluate((k) => JSON.parse(localStorage.getItem(k)).loops.at(-1).loop, LOOPS);
  expect(stored.notes).toHaveLength(24);
  expect(stored.notes[19].length).toBe(1);
  await page.reload();
  expect((await page.evaluate((k) => JSON.parse(localStorage.getItem(k)).loops.at(-1).loop, LOOPS)).notes).toHaveLength(24);
  const { encodeLoop } = await import("../src/loop.ts");
  const code = await encodeLoop(stored);
  const other = await browser.newContext({ baseURL });
  const b = await other.newPage();
  await b.goto("/#loop=" + code);
  await b.locator("#add-loop").click();
  await expect.poll(() => b.evaluate((k) => JSON.parse(localStorage.getItem(k) ?? "null")?.loops.at(-1)?.loop.notes.length, LOOPS)).toBe(24);
  await other.close();
});

test("PLAY wraps at the loop's length: the playhead reaches step 16, then starts again at 1", async ({ page }) => {
  await open(page);
  await tool(page, "#loop-length-16");
  await page.locator("#loop-play").click();
  // every step number that lights, in order (a step lights for 0.2 s, too short to poll for)
  await page.evaluate(() => {
    window.seen = [];
    new MutationObserver(() => {
      const on = document.querySelector("#loop-grid .step.now")?.textContent;
      if (on && on !== window.seen.at(-1)) window.seen.push(on);
    }).observe(document.querySelector("#loop-grid"), { subtree: true, attributes: true, attributeFilter: ["class"] });
  });
  const seen = () => page.evaluate(() => window.seen);
  await page.locator("#loop-page-2").click();
  await expect.poll(async () => (await seen()).includes("16"), { timeout: 8000 }).toBe(true);
  expect(await seen()).not.toContain("17");
  await page.locator("#loop-page-1").click();
  await expect.poll(async () => { const s = await seen(); return s.lastIndexOf("1") > s.lastIndexOf("16"); }, { timeout: 8000 }).toBe(true);
  expect((await seen()).filter((x) => +x > 16)).toEqual([]);
  await page.locator("#loop-play").click();
});

test("a long loop as a level's song: the looping buffer is whole passes, 25.6 s at 16 steps and 38.4 s at 24", async ({ page }) => {
  await page.addInitScript(() => {
    window.loops = [];
    const start = AudioBufferSourceNode.prototype.start;
    AudioBufferSourceNode.prototype.start = function (...a) { if (this.loop && this.buffer) window.loops.push(this.buffer.duration); return start.apply(this, a); };
  });
  await open(page, 1280, 900);
  await page.locator("#sound").evaluate(() => {}); // the home screen's sound button is behind the loops screen
  for (const [n, seconds] of [[16, 25.6], [24, 38.4]]) {
    await page.goto("/");
    if ((await page.locator("#sound").textContent()).includes("OFF")) await page.locator("#sound").click();
    await page.locator("#loops-open").click();
    await page.locator("#new-loop").click();
    await tool(page, `#loop-length-${n}`);
    await page.locator("#loop-name").fill(`L${n}`);
    await page.locator("#save-loop").click();
    await page.locator("#my-levels").click();
    await page.locator("#new-level").click();
    await page.locator("#level-settings").click();
    await page.locator("#level-song").selectOption({ label: `L${n}` });
    await page.locator("#sheet-close").click();
    await page.locator("#test-level").click();
    await expect.poll(() => page.evaluate(() => window.loops.at(-1)), { timeout: 30000 }).toBeCloseTo(seconds, 3);
  }
});

test("a phone with swipe on: a 32 step loop's last page is a tap away, and its steps paint", async ({ browser, baseURL, browserName }) => {
  test.skip(browserName !== "chromium", "touch is driven through Chromium's devtools input");
  const context = await browser.newContext({ baseURL, hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  await page.goto("/");
  await page.locator("#loops-open").click();
  await page.locator("#new-loop").click();
  await tool(page, "#loop-length-32");
  await page.locator("#loop-swipe").click();
  await page.locator("#loop-page-4").click();
  const cdp = await context.newCDPSession(page);
  const touch = (type, pts) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints: pts.map(([x, y]) => ({ x, y })) });
  const at = async (s) => { const r = await page.getByRole("button", { name: `note 5 step ${s}`, exact: true }).boundingBox(); return [r.x + r.width / 2, r.y + r.height / 2]; };
  const a = await at(30), b = await at(32);
  await touch("touchStart", [a]);
  for (let i = 1; i <= 6; i++) await touch("touchMove", [[a[0] + ((b[0] - a[0]) * i) / 6, a[1]]]);
  await touch("touchEnd", []);
  for (const s of [30, 31, 32]) await expect(page.getByRole("button", { name: `note 5 step ${s}`, exact: true })).toHaveAttribute("aria-pressed", "true");
  await context.close();
});
