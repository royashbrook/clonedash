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
    outs.delete(this);
    return disconnect.apply(this, a);
  };
  // every node of a live context wired straight to the speakers and not yet cut
  const outs = new Set(), toDestination = AudioNode.prototype.connect;
  AudioNode.prototype.connect = function (target, ...rest) {
    if (target instanceof AudioDestinationNode && this.context instanceof AudioContext) outs.add(this);
    return toDestination.call(this, target, ...rest);
  };
  window.liveOutputs = () => outs.size;
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
  await page.locator("#sheet").getByRole("button", { name: "CLEAR NOTES", exact: true }).click();
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

const pressed = (page) => page.locator("#loop-grid .cell[aria-pressed=true]").evaluateAll((cells) => cells.map((c) => c.ariaLabel));
const hide = (page) => page.evaluate(() => {
  Object.defineProperty(document, "hidden", { configurable: true, get: () => true });
  document.dispatchEvent(new Event("visibilitychange"));
});

test("replacing notes asks first, KEEP IT changes nothing, and a blank draft is not asked", async ({ browser, baseURL }) => {
  const ctx = await device(browser, baseURL);
  const page = await ctx.newPage();
  await page.goto("/");
  await page.locator("#loops-open").click();
  await page.locator("#new-loop").click();
  const before = await pressed(page);
  expect(before.some((l) => l.startsWith("note"))).toBe(true);
  for (const [open, title] of [
    [() => page.locator("#loop-surprise").click(), "Make new notes?"],
    [() => page.locator("#loop-clear").click(), "Clear the notes?"],
    [() => page.locator("#loop-song").selectOption({ label: "Air Time" }), "Start from Air Time?"],
  ]) {
    await open();
    await expect(page.locator("#sheet-title")).toHaveText(title);
    await page.locator("#sheet").getByRole("button", { name: "KEEP IT", exact: true }).click();
    expect(await pressed(page)).toEqual(before);
  }
  await page.locator("#loop-song").selectOption({ label: "Air Time" });
  await page.locator("#sheet").getByRole("button", { name: "START FROM IT", exact: true }).click();
  expect(await pressed(page)).not.toEqual(before);
  await page.locator("#loop-clear").click();
  await page.locator("#sheet").getByRole("button", { name: "CLEAR NOTES", exact: true }).click();
  expect((await pressed(page)).some((l) => l.startsWith("note"))).toBe(false);
  // nothing left to lose: SURPRISE ME just does it
  await page.locator("#loop-surprise").click();
  await expect(page.locator("#sheet")).not.toBeVisible();
  await ctx.close();
});

test("START FROM asks for a drum-only loop too: KEEP IT keeps every field, START FROM IT applies the song", async ({ browser, baseURL }) => {
  const ctx = await device(browser, baseURL);
  const page = await ctx.newPage();
  await page.goto("/");
  await page.locator("#loops-open").click();
  await page.locator("#new-loop").click();
  await page.locator("#loop-clear").click();
  await page.locator("#sheet").getByRole("button", { name: "CLEAR NOTES", exact: true }).click();
  // no notes at all, but drums, key and drop of its own
  for (const cell of ["kick step 2", "kick step 8", "snare step 3", "hat step 1"]) await page.getByRole("button", { name: cell, exact: true }).click();
  await page.locator("#key-up").click();
  await page.locator("#loop-drop").click();
  const state = async () => ({ cells: await pressed(page), key: await page.locator("#loop-key").textContent(), drop: await page.locator("#loop-drop").textContent() });
  const before = await state();
  expect(before.cells.some((l) => l.startsWith("note"))).toBe(false);
  await page.locator("#loop-song").selectOption({ label: "Air Time" });
  await expect(page.locator("#sheet-title")).toHaveText("Start from Air Time?");
  await page.locator("#sheet").getByRole("button", { name: "KEEP IT", exact: true }).click();
  expect(await state()).toEqual(before);
  await page.locator("#loop-song").selectOption({ label: "Air Time" });
  await page.locator("#sheet").getByRole("button", { name: "START FROM IT", exact: true }).click();
  const after = await state();
  expect(after.key).toBe("A"); // Air Time's root, 45
  expect(after.drop).toBe("DROP OFF");
  expect(after.cells.filter((l) => l.startsWith("kick"))).toEqual(["kick step 1", "kick step 4", "kick step 6"]);
  await ctx.close();
});

test("a tapped cell's sound is cut by a sheet, by PLAY taking over and by the page hiding", async ({ browser, baseURL }) => {
  const ctx = await device(browser, baseURL);
  const page = await ctx.newPage();
  await page.goto("/");
  await page.locator("#loops-open").click();
  await page.locator("#new-loop").click();
  // each tap turns a different cell ON (a cell tapped OFF makes no sound)
  const cells = ["kick step 2", "kick step 3", "snare step 2"];
  const tap = async () => {
    await page.getByRole("button", { name: cells.shift(), exact: true }).click();
    await expect.poll(() => page.evaluate(() => window.liveOutputs())).toBe(1);
  };
  await tap();
  await page.locator("#loop-surprise").click(); // a sheet
  expect(await page.evaluate(() => window.liveOutputs())).toBe(0);
  await page.locator("#sheet").getByRole("button", { name: "KEEP IT", exact: true }).click();
  await tap();
  await page.locator("#loop-play").click(); // PLAY takes over: only its own output stays
  await expect.poll(() => page.evaluate(() => window.liveOutputs())).toBe(1);
  await page.locator("#loop-play").click();
  expect(await page.evaluate(() => window.liveOutputs())).toBe(0);
  await tap();
  await hide(page);
  expect(await page.evaluate(() => window.liveOutputs())).toBe(0);
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
  const [download] = await Promise.all([pa.waitForEvent("download"), pa.locator(".download-level").click()]);
  expect(download.suggestedFilename()).toBe("cube-dash-loop.clonedash.txt");
  const fileText = await (await import("node:fs/promises")).readFile(await download.path(), "utf8");
  expect(fileText).toBe(code);
  await a.close();
  for (const how of ["link", "code", "file"]) {
    const b = await device(browser, baseURL, { [LOOPS]: JSON.stringify(storeOf("Mine")) });
    const pb = await b.newPage();
    if (how === "link") await pb.goto("/#loop=" + code);
    else {
      await pb.goto("/");
      await pb.locator("#loops-open").click();
      await pb.locator("#import-loop").click();
      if (how === "code") {
        await pb.locator("#import-code").fill(code);
        await pb.locator("#preview-level").click();
      } else await pb.locator("#level-file").setInputFiles({ name: "cube-dash-loop.clonedash.txt", mimeType: "text/plain", buffer: Buffer.from(fileText) });
    }
    await expect(pb.locator("#sheet")).toContainText("Adds a new loop to My loops. Nothing is replaced.");
    // the preview neither plays nor writes until tapped
    expect(await pb.evaluate(() => window.liveOutputs())).toBe(0);
    expect(JSON.parse(await stored(pb, LOOPS)).loops.map((e) => e.loop.name)).toEqual(["Mine"]);
    if (how === "code") {
      // heard on a tap; changing the input silences it
      await pb.locator("#play-import-loop").click();
      await expect.poll(() => pb.evaluate(() => window.liveModulators())).toBeGreaterThan(0);
      await pb.locator("#import-code").fill(code + " ");
      expect(await pb.evaluate(() => [window.liveOutputs(), window.liveModulators()])).toEqual([0, 0]);
      await pb.locator("#preview-level").click();
    }
    if (how === "file") {
      // closing the sheet while it plays silences it
      await pb.locator("#play-import-loop").click();
      await expect.poll(() => pb.evaluate(() => window.liveModulators())).toBeGreaterThan(0);
      await pb.keyboard.press("Escape");
      await expect.poll(() => pb.evaluate(() => [window.liveOutputs(), window.liveModulators()])).toEqual([0, 0]);
      await b.close();
      continue;
    }
    await pb.locator("#play-import-loop").click();
    await expect.poll(() => pb.evaluate(() => window.liveOutputs())).toBe(1);
    await pb.locator("#add-loop").click();
    expect(await pb.evaluate(() => [window.liveOutputs(), window.liveModulators()])).toEqual([0, 0]);
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
