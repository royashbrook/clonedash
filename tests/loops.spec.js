import { test, expect } from "@playwright/test";
import { encodeBackup } from "../src/backup.ts";
import { LEVELS } from "../src/levels.ts";
import { emptyLoops, addLoop, blankLoop, encodeLoop, loopLink } from "../src/loop.ts";

// The LOOPS screen in a real browser, both engines (#121, docs/loops.md).
const GAME = "clonedash.v1",
  SKINS = "clonedash.skins.v1",
  LOOPS = "clonedash.loops.v1";
const LEVEL_SAVE = { version: 1, sound: false, best: { 0: 100 }, draft: { name: "Mine", length: 40, objects: [] }, activeLevel: 1, customLevels: [{ id: 1, level: { name: "Mine", length: 40, objects: [] } }] };
const tune = (name) => ({ ...blankLoop(), name, root: 43, wobble: 3, notes: [[0], [], [12], [], [7], [5], [3], []] });
const storeOf = (...names) => { const s = emptyLoops(); for (const n of names) addLoop(s, tune(n)); return s; };

// Counts the live wobble modulators from outside the player: an oscillator in a real (not offline)
// AudioContext whose gain feeds an AudioParam. It also records whether each was disconnected
// before it was stopped.
const instrument = () => {
  const mods = new Set(), feeds = new WeakMap();
  window.audioLog = { started: 0, stoppedConnected: 0 };
  const connect = AudioNode.prototype.connect;
  AudioNode.prototype.connect = function (target, ...rest) {
    if (this instanceof OscillatorNode && target instanceof GainNode) feeds.set(this, target);
    if (this instanceof GainNode && target instanceof AudioParam) this.modulates = true;
    return connect.call(this, target, ...rest);
  };
  const live = (o) => o.context instanceof AudioContext && feeds.get(o)?.modulates;
  const start = OscillatorNode.prototype.start;
  OscillatorNode.prototype.start = function (...a) {
    queueMicrotask(() => { if (live(this)) { mods.add(this); window.audioLog.started++; } });
    return start.apply(this, a);
  };
  const disconnect = AudioNode.prototype.disconnect;
  AudioNode.prototype.disconnect = function (...a) {
    this.cut = true;
    return disconnect.apply(this, a);
  };
  const stop = OscillatorNode.prototype.stop;
  OscillatorNode.prototype.stop = function (...a) {
    if (mods.has(this)) { if (!this.cut) window.audioLog.stoppedConnected++; mods.delete(this); }
    return stop.apply(this, a);
  };
  window.liveModulators = () => mods.size;
};

async function device(browser, baseURL, stores = {}, viewport = { width: 932, height: 430 }) {
  const context = await browser.newContext({ baseURL, viewport, hasTouch: true });
  await context.addInitScript((stores) => {
    try {
      if (sessionStorage.getItem("seeded")) return;
      sessionStorage.setItem("seeded", "1");
    } catch {
      return; // about:blank has no storage
    }
    for (const [k, v] of Object.entries(stores)) if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v);
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: async (t) => (window.copied = t) } });
  }, { [GAME]: JSON.stringify(LEVEL_SAVE), ...stores });
  await context.addInitScript(instrument);
  return context;
}
const stored = (page, key) => page.evaluate((k) => localStorage.getItem(k), key);

test("make a loop, hear it, save it, and find it after a reload", async ({ browser, baseURL }) => {
  const ctx = await device(browser, baseURL);
  const page = await ctx.newPage();
  await page.goto("/");
  await page.locator("#loops-open").click();
  await expect(page.locator("#loops h1")).toHaveText("My loops");
  await page.locator("#new-loop").click();
  await page.locator("#loop-name").fill("Night drive");
  await page.locator("#loop-clear").click();
  await page.getByRole("button", { name: "note 10 step 1", exact: true }).click();
  await page.getByRole("button", { name: "note 1 step 3", exact: true }).click();
  await page.getByRole("button", { name: "snare step 7", exact: true }).click();
  await page.locator("#key-up").click();
  await page.locator("#loop-drop").click();
  await page.locator("#save-loop").click();
  await expect(page.locator("#loop-message")).toHaveText("Saved.");
  const saved = JSON.parse(await stored(page, LOOPS)).loops[0].loop;
  expect(saved).toMatchObject({ name: "Night drive", root: 41, drop: true, snare: [4, 6] });
  expect(saved.notes[0]).toEqual([22]);
  expect(saved.notes[2]).toEqual([0]);
  await page.reload();
  await page.locator("#loops-open").click();
  await expect(page.getByRole("heading", { name: "Night drive" })).toBeVisible();
  // the level save and skins are never written by loops
  expect(JSON.parse(await stored(page, GAME))).toEqual(LEVEL_SAVE);
  expect(await stored(page, SKINS)).toBeNull();
  await ctx.close();
});

test("live play keeps only the beats in flight, disconnects before stopping, and STOP or leaving ends every one", async ({ browser, baseURL }) => {
  const ctx = await device(browser, baseURL, { [LOOPS]: JSON.stringify(storeOf("Long one")) });
  const page = await ctx.newPage();
  await page.goto("/");
  await page.locator("#loops-open").click();
  await page.getByRole("button", { name: "Play Long one" }).click();
  // real audio time: about eight bass beats
  let most = 0;
  for (let i = 0; i < 16; i++) {
    await page.waitForTimeout(200);
    most = Math.max(most, await page.evaluate(() => window.liveModulators()));
  }
  const log = await page.evaluate(() => window.audioLog);
  expect(log.started).toBeGreaterThanOrEqual(5);
  expect(most).toBeLessThanOrEqual(3);
  await page.getByRole("button", { name: "Stop Long one" }).click();
  expect(await page.evaluate(() => window.liveModulators())).toBe(0);
  // again, then leave the screen while playing
  await page.getByRole("button", { name: "Play Long one" }).click();
  await page.waitForTimeout(1200);
  await page.locator("#loops-back").click();
  expect(await page.evaluate(() => window.liveModulators())).toBe(0);
  expect(await page.evaluate(() => window.audioLog.stoppedConnected)).toBe(0);
  await ctx.close();
});

test("a loop shared by code and link arrives as a preview, and ADD only adds", async ({ browser, baseURL }) => {
  const a = await device(browser, baseURL, { [LOOPS]: JSON.stringify(storeOf("Sendable")) });
  const pa = await a.newPage();
  await pa.goto("/");
  await pa.locator("#loops-open").click();
  await pa.getByRole("button", { name: "Share Sendable" }).click();
  await expect(pa.locator("#sheet-title")).toHaveText("Share loop");
  await pa.locator("#copy-level").click();
  const code = await pa.evaluate(() => window.copied);
  expect(code.startsWith("cdm1.")).toBe(true);
  await a.close();
  for (const how of ["link", "code"]) {
    const b = await device(browser, baseURL, { [LOOPS]: JSON.stringify(storeOf("Mine")) });
    const pb = await b.newPage();
    if (how === "link") await pb.goto("/#loop=" + code);
    else {
      await pb.goto("/");
      await pb.locator("#loops-open").click();
      await pb.locator("#import-loop").click();
      await pb.locator("#import-code").fill(code);
      await pb.locator("#preview-level").click();
    }
    await expect(pb.locator("#sheet")).toContainText("Adds a new loop to My loops. Nothing is replaced.");
    expect(JSON.parse(await stored(pb, LOOPS)).loops.map((e) => e.loop.name)).toEqual(["Mine"]);
    await pb.locator("#add-loop").click();
    await expect(pb.getByRole("heading", { name: "Sendable" })).toBeVisible();
    expect(JSON.parse(await stored(pb, LOOPS)).loops.map((e) => e.loop.name)).toEqual(["Mine", "Sendable"]);
    await b.close();
  }
});

test("a save carries loops, and loading one without loops removes them", async ({ browser, baseURL }) => {
  const withLoops = { game: LEVEL_SAVE, skins: { version: 1, next: 1, skins: [] }, loops: storeOf("Kept") };
  for (const [save, expected] of [[withLoops, storeOf("Kept")], [{ game: LEVEL_SAVE, skins: withLoops.skins }, null]]) {
    const b = await device(browser, baseURL, { [LOOPS]: JSON.stringify(storeOf("Old one", "Old two")) });
    const pb = await b.newPage();
    await pb.goto("/#save=" + (await encodeBackup(save, LEVELS.length)));
    await expect(pb.locator("#here-summary")).toContainText("· 2 loops");
    await Promise.all([pb.waitForEvent("load"), pb.locator("#replace-save").click()]);
    expect(JSON.parse(await stored(pb, LOOPS))).toEqual(expected);
    await b.close();
  }
});

test("the loops list and editor fit 320 wide and phone landscape with 44px targets", async ({ browser, baseURL }) => {
  for (const viewport of [{ width: 320, height: 568 }, { width: 844, height: 390 }]) {
    const ctx = await device(browser, baseURL, { [LOOPS]: JSON.stringify(storeOf("A loop with a long name that wraps")) }, viewport);
    const page = await ctx.newPage();
    await page.goto("/");
    await page.locator("#loops-open").click();
    for (const view of ["list", "edit"]) {
      if (view === "edit") await page.locator("#new-loop").click();
      const m = await page.evaluate(() => {
        const screen = document.querySelector("#loops");
        const box = document.querySelector(".loop-grid-box");
        const visible = [...screen.querySelectorAll("button, input, select")].filter((e) => e.getClientRects().length);
        return {
          page: document.documentElement.scrollWidth - innerWidth,
          screen: screen.scrollWidth - screen.clientWidth,
          grid: box ? box.getBoundingClientRect().right - innerWidth : 0,
          small: visible.filter((e) => { const r = e.getBoundingClientRect(); return r.height < 44 || (r.width < 44 && e.type !== "range"); }).map((e) => e.id || e.ariaLabel || e.textContent),
        };
      });
      expect([m.page, m.screen], `${viewport.width} ${view}`).toEqual([0, 0]);
      expect(m.grid, `${viewport.width} ${view}`).toBeLessThanOrEqual(0);
      expect(m.small, `${viewport.width} ${view}`).toEqual([]);
    }
    await ctx.close();
  }
});
