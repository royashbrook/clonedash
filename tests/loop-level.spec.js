import { test, expect } from "./quiet.mjs";
import { encodeBackup } from "../src/backup.ts";
import { LEVELS } from "../src/levels.ts";
import { addLoop, blankLoop, emptyLoops } from "../src/loop.ts";

// A loop as a custom level's song, in a real browser, both engines (#121 slice B, docs/loops.md).
const GAME = "clonedash.v1",
  LOOPS = "clonedash.loops.v1";
const tune = { ...blankLoop(), name: "Level tune", root: 43, wobble: 3, notes: [[0], [], [12], [], [7], [], [3], []] };
const level = { name: "Mine", length: 40, objects: [] };
const SAVE = { version: 1, sound: true, best: {}, draft: level, activeLevel: 1, customLevels: [{ id: 1, level }] };
const loopStore = () => { const s = emptyLoops(); addLoop(s, tune); return s; };

// Each offline render's oscillator score, and the score of each looping buffer that starts, so the
// music actually playing can be named (separate renders are not bit-identical).
const scores = () => {
  window.loopScores = []; window.bufferScores = new WeakMap();
  const contextScores = new WeakMap(), create = OfflineAudioContext.prototype.createOscillator;
  OfflineAudioContext.prototype.createOscillator = function () {
    const o = create.call(this), start = o.start, context = this;
    o.start = function (...args) {
      if (!contextScores.has(context)) contextScores.set(context, []);
      contextScores.get(context).push([o.type, o.frequency.value, args[0]]);
      return start.apply(this, args);
    };
    return o;
  };
  const render = OfflineAudioContext.prototype.startRendering;
  OfflineAudioContext.prototype.startRendering = async function () {
    const buffer = await render.call(this);
    window.bufferScores.set(buffer, JSON.stringify(contextScores.get(this)));
    return buffer;
  };
  const start = AudioBufferSourceNode.prototype.start;
  AudioBufferSourceNode.prototype.start = function (...args) {
    if (this.loop && this.buffer) window.loopScores.push({ score: window.bufferScores.get(this.buffer), duration: this.buffer.duration });
    return start.apply(this, args);
  };
};
async function device(browser, baseURL, stores) {
  const context = await browser.newContext({ baseURL, viewport: { width: 932, height: 430 }, hasTouch: true });
  await context.addInitScript((stores) => {
    try {
      if (sessionStorage.getItem("seeded")) return;
      sessionStorage.setItem("seeded", "1");
    } catch {
      return;
    }
    for (const [k, v] of Object.entries(stores)) localStorage.setItem(k, v);
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: async (t) => (window.copied = t) } });
  }, stores);
  await context.addInitScript(scores);
  return context;
}
const stored = (page, key) => page.evaluate((k) => JSON.parse(localStorage.getItem(k)), key);
const loopScore = (page, loop) => page.evaluate(async (loop) => {
  const { composeLoop } = await import("/music.js");
  return window.bufferScores.get(await composeLoop(loop));
}, loop);

test("pick a saved loop as a level's song, hear exactly it, keep it after a reload, and a song clears it", async ({ browser, baseURL }) => {
  const ctx = await device(browser, baseURL, { [GAME]: JSON.stringify(SAVE), [LOOPS]: JSON.stringify(loopStore()) });
  const page = await ctx.newPage();
  await page.goto("/");
  await page.locator("#my-levels").click();
  await page.getByRole("button", { name: "Edit Mine", exact: true }).click();
  await page.locator("#level-settings").click();
  await page.locator("#level-song").selectOption({ label: "Level tune" });
  let draft = (await stored(page, GAME)).draft;
  expect(draft.loop).toEqual(tune);
  expect("song" in draft).toBe(false);
  await expect(page.locator("#level-song")).toHaveValue("this-loop");
  const expected = await loopScore(page, tune);
  await page.locator("#sheet-close").click();
  await page.locator("#test-level").click();
  await expect.poll(() => page.evaluate(() => window.loopScores.length), { timeout: 20000 }).toBeGreaterThan(0);
  const playing = await page.evaluate(() => window.loopScores.at(-1));
  expect(playing.score).toBe(expected);
  expect(playing.duration).toBeCloseTo(25.6, 3);
  await page.reload();
  draft = (await stored(page, GAME)).draft;
  expect(draft.loop).toEqual(tune);
  await page.locator("#my-levels").click();
  await expect(page.locator("#library")).toContainText("♪ Level tune");
  await page.getByRole("button", { name: "Edit Mine", exact: true }).click();
  await page.locator("#level-settings").click();
  await page.locator("#level-song").selectOption("5");
  draft = (await stored(page, GAME)).draft;
  expect(draft.song).toBe(5);
  expect("loop" in draft).toBe(false);
  await ctx.close();
});

test("a loop level shares as cdl3 and arrives with its loop; ADD keeps it and does not touch My loops; deleting the saved loop leaves the level's copy", async ({ browser, baseURL }) => {
  const withLoop = { ...SAVE, draft: { ...level, loop: tune }, customLevels: [{ id: 1, level: { ...level, loop: tune } }] };
  const a = await device(browser, baseURL, { [GAME]: JSON.stringify(withLoop), [LOOPS]: JSON.stringify(loopStore()) });
  const pa = await a.newPage();
  await pa.goto("/");
  // deleting the saved loop never changes the level that copied it
  await pa.locator("#loops-open").click();
  await pa.getByRole("button", { name: "Delete Level tune", exact: true }).click();
  await pa.locator("#sheet").getByRole("button", { name: "DELETE LOOP", exact: true }).click();
  expect((await stored(pa, LOOPS)).loops).toEqual([]);
  expect((await stored(pa, GAME)).customLevels[0].level.loop).toEqual(tune);
  await pa.locator("#loops-back").click();
  await pa.locator("#my-levels").click();
  await pa.getByRole("button", { name: "Share Mine", exact: true }).click();
  await pa.locator("#copy-level").click();
  const code = await pa.evaluate(() => window.copied);
  expect(code.startsWith("cdl3.")).toBe(true);
  await a.close();
  const b = await device(browser, baseURL, { [GAME]: JSON.stringify(SAVE) });
  const pb = await b.newPage();
  await pb.goto("/#level=" + code);
  await expect(pb.locator("#sheet")).toContainText("♪ Level tune (its own loop)");
  await pb.locator("#add-level").click();
  const added = (await stored(pb, GAME)).customLevels.at(-1).level;
  expect(added.loop).toEqual(tune);
  expect("song" in added).toBe(false);
  expect(await stored(pb, LOOPS)).toBeNull();
  await b.close();
});

test("EDIT A COPY of a loop level keeps its loop and adds no song beside it", async ({ browser, baseURL }) => {
  const game = { ...SAVE, draft: { ...level, loop: tune }, customLevels: [{ id: 1, level: { ...level, loop: tune } }] };
  const ctx = await device(browser, baseURL, { [GAME]: JSON.stringify(game) });
  const page = await ctx.newPage();
  await page.goto("/");
  await page.locator("#my-levels").click();
  await page.getByRole("button", { name: "Play Mine", exact: true }).click();
  await page.evaluate(() => window.dispatchEvent(new Event("blur"))); // losing focus pauses
  await page.locator("#sheet").getByRole("button", { name: "EDIT A COPY", exact: true }).click();
  const levels = (await stored(page, GAME)).customLevels;
  expect(levels).toHaveLength(2);
  const copy = levels.at(-1).level;
  expect(copy.name).toBe("Mine (copy)");
  expect(copy.loop).toEqual(tune);
  expect("song" in copy).toBe(false);
  await ctx.close();
});

test("MOVE YOUR SAVE carries a loop level", async ({ browser, baseURL }) => {
  const game = { ...SAVE, draft: { ...level, loop: tune }, customLevels: [{ id: 1, level: { ...level, loop: tune } }] };
  const b = await device(browser, baseURL, { [GAME]: JSON.stringify(SAVE) });
  const pb = await b.newPage();
  await pb.goto("/#save=" + (await encodeBackup({ game, skins: { version: 1, next: 1, skins: [] } }, LEVELS.length)));
  await Promise.all([pb.waitForEvent("load"), pb.locator("#replace-save").click()]);
  expect((await stored(pb, GAME)).customLevels[0].level.loop).toEqual(tune);
  await b.close();
});
