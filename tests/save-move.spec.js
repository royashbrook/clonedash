import { test, expect } from "@playwright/test";
import jsQR from "jsqr";
import { encodeBackup } from "../src/backup.ts";
import { LEVELS } from "../src/levels.ts";

// Moving a whole save between devices, both engines (#124, src/backup.ts, src/SaveMove.svelte).
// Each browser context is one device.
const GAME = "clonedash.v1",
  SKINS = "clonedash.skins.v1",
  IMPORT = "clonedash.import";
const piece = (type, x, y = 0, extra = {}) => ({ type, x, y, rotation: 0, flipX: false, flipY: false, ...extra });
const mine = {
  name: "Mine",
  length: 60,
  height: 9,
  song: 9,
  objects: [
    piece("block", 6, 0, { group: 1 }),
    piece("grid", 9, 1, { scaleX: 2, scaleY: 0.5 }),
    piece("ring", 12, 2, { multi: true }),
    piece("move-trigger", 14, 0, { touch: true, multi: true, target: 1, moveY: 2, duration: 0.5 }),
  ],
};
const second = { name: "Second", length: 40, song: 10, objects: [piece("spike", 8)] };
const FULL = {
  game: {
    version: 1,
    sound: true,
    best: { 0: 100, 2: 64 },
    coins: { 0: 2 },
    draft: second,
    activeLevel: 2,
    customLevels: [
      { id: 1, level: mine, coins: 1 },
      { id: 2, level: second },
    ],
  },
  skins: {
    version: 1,
    next: 3,
    skins: [
      { id: 1, skin: { name: "Robot", width: 4, height: 4, palette: ["#ff5c7a"], pixels: "1".repeat(16) } },
      { id: 2, skin: { name: "Blank", width: 4, height: 4, palette: ["#ffffff"], pixels: "0".repeat(16) } },
    ],
    selected: 1,
  },
};
const FRESH_GAME = { version: 1, sound: false, best: { 0: 12 }, draft: { name: "Old", length: 40, objects: [] }, activeLevel: 1, customLevels: [{ id: 1, level: { name: "Old", length: 40, objects: [] } }] };

async function device(browser, baseURL, stores = {}) {
  const context = await browser.newContext({ baseURL, viewport: { width: 932, height: 430 }, hasTouch: true });
  await context.addInitScript((stores) => {
    if (sessionStorage.getItem("seeded")) return; // seeded once per page, so a reload keeps what the game wrote
    sessionStorage.setItem("seeded", "1");
    for (const [k, v] of Object.entries(stores)) if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v);
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: async (t) => (window.copied = t) } });
  }, stores);
  return context;
}
const stored = (page, key) => page.evaluate((k) => localStorage.getItem(k), key);
const both = async (page) => ({ game: JSON.parse(await stored(page, GAME)), skins: JSON.parse(await stored(page, SKINS)) });
async function openMove(page) {
  await page.locator("#about").click();
  await page.locator("#move-save").click();
  await expect(page.locator("#sheet-title")).toHaveText("Move your save");
}

test("send on one device, load on another by link, pasted code and file: everything arrives", async ({ browser, baseURL }) => {
  const a = await device(browser, baseURL, { [GAME]: JSON.stringify(FULL.game), [SKINS]: JSON.stringify(FULL.skins) });
  const pa = await a.newPage();
  await pa.goto("/");
  await openMove(pa);
  await expect(pa.locator("#save-summary")).toHaveText("2 built-in levels played · 2 of your own levels · 2 skins");
  // a save with levels in it is past the QR density cap: the code and file carry it
  await expect(pa.locator(".qr-fallback")).toBeVisible();
  await pa.locator("#copy-save").click();
  const code = await pa.evaluate(() => window.copied);
  expect(code.startsWith("cdb1.")).toBe(true);
  const sent = await both(pa);

  for (const how of ["link", "code", "file"]) {
    const b = await device(browser, baseURL, { [GAME]: JSON.stringify(FRESH_GAME), [SKINS]: null });
    const pb = await b.newPage();
    if (how === "link") {
      await pb.goto("/#save=" + code);
    } else {
      await pb.goto("/");
      await openMove(pb);
      await pb.locator("#save-load").click();
      if (how === "code") {
        await pb.locator("#save-input").fill(code);
        await pb.locator("#preview-save").click();
      } else
        await pb.locator("#save-file").setInputFiles({ name: "cube-dash-save.clonedash.txt", mimeType: "text/plain", buffer: Buffer.from(code) });
    }
    await expect(pb.locator("#incoming-summary")).toHaveText("2 built-in levels played · 2 of your own levels · 2 skins");
    await expect(pb.locator("#here-summary")).toHaveText("1 built-in levels played · 1 of your own levels · 0 skins");
    // arriving or previewing never writes
    expect(JSON.parse(await stored(pb, GAME))).toEqual(FRESH_GAME);
    expect(await stored(pb, SKINS)).toBeNull();
    await Promise.all([pb.waitForEvent("load"), pb.locator("#replace-save").click()]);
    expect(await both(pb), how).toEqual(sent);
    expect(JSON.parse(await stored(pb, IMPORT)).state).toBe("done");
    await expect(pb.locator("#sound")).toHaveText("SOUND ON");
    await b.close();
  }
  await a.close();
});

test("a small save is a QR that scans to its own link", async ({ browser, baseURL }) => {
  const a = await device(browser, baseURL, { [GAME]: JSON.stringify(FRESH_GAME) });
  const pa = await a.newPage();
  await pa.goto("/");
  await openMove(pa);
  await pa.locator("#copy-save").click();
  const code = await pa.evaluate(() => window.copied);
  const scanned = await pa.locator(".save-qr").evaluate(async (img) => {
    await img.decode();
    const c = document.createElement("canvas");
    c.width = img.naturalWidth; c.height = img.naturalHeight;
    const g = c.getContext("2d"); g.drawImage(img, 0, 0);
    return Array.from(g.getImageData(0, 0, c.width, c.height).data);
  });
  const size = Math.sqrt(scanned.length / 4);
  const qr = jsQR(Uint8ClampedArray.from(scanned), size, size);
  expect(new URL(qr.data).hash).toBe("#save=" + code);
  await a.close();
});

test("bad, newer and cancelled loads write nothing; a save code in the level import points to ABOUT", async ({ browser, baseURL }) => {
  const b = await device(browser, baseURL, { [GAME]: JSON.stringify(FRESH_GAME), [SKINS]: null });
  const pb = await b.newPage();
  await pb.goto("/");
  const code = await encodeBackup(FULL, LEVELS.length);
  await openMove(pb);
  await pb.locator("#save-load").click();
  for (const [text, words] of [
    ["cdb1.0nope*", "Invalid save code."],
    ["cdb2.0AAAA", "This save is from a newer Cube Dash. Update the game, then load it again."],
    ["cdb1.0" + Buffer.from(JSON.stringify({ v: 1, ...FULL, loops: {} })).toString("base64url"), "This save is from a newer Cube Dash. Update the game, then load it again."],
    ["cdb1.0" + Buffer.from(JSON.stringify({ v: 1, game: { ...FULL.game, sound: "yes" }, skins: FULL.skins })).toString("base64url"), "This save is damaged, so nothing was loaded."],
  ]) {
    await pb.locator("#save-input").fill(text);
    await pb.locator("#preview-save").click();
    await expect(pb.locator("#sheet .move [role=status]").last()).toHaveText(words);
    await expect(pb.locator("#replace-save")).toHaveCount(0);
  }
  // a good preview, then closing the sheet: nothing written
  await pb.locator("#save-input").fill(code);
  await pb.locator("#preview-save").click();
  await expect(pb.locator("#replace-save")).toBeVisible();
  await pb.keyboard.press("Escape");
  expect(JSON.parse(await stored(pb, GAME))).toEqual(FRESH_GAME);
  expect(await stored(pb, SKINS)).toBeNull();
  expect(await stored(pb, IMPORT)).toBeNull();
  // the level/skin import refuses a save and names where it goes
  await pb.locator("#my-levels").click();
  await pb.locator("#import-level").click();
  await pb.locator("#import-code").fill(code);
  await pb.locator("#preview-level").click();
  await expect(pb.locator("#sheet")).toContainText("This is a whole save, not a level or skin. Load it from ABOUT → MOVE YOUR SAVE.");
  expect(JSON.parse(await stored(pb, GAME))).toEqual(FRESH_GAME);
  await b.close();
});

test("a link with a save and anything else is refused before reading either", async ({ browser, baseURL }) => {
  const b = await device(browser, baseURL, { [GAME]: JSON.stringify(FRESH_GAME) });
  const pb = await b.newPage();
  const code = await encodeBackup(FULL, LEVELS.length);
  await pb.goto(`/#save=${code}&skin=cds1.0AAAA`);
  await expect(pb.locator("#sheet")).toContainText("This link does not contain one save.");
  await expect(pb.locator("#replace-save")).toHaveCount(0);
  expect(JSON.parse(await stored(pb, GAME))).toEqual(FRESH_GAME);
  await b.close();
});

test("a tab that missed the load reloads before its next write instead of writing its old save back", async ({ browser, baseURL }) => {
  const ctx = await device(browser, baseURL, { [GAME]: JSON.stringify(FRESH_GAME), [SKINS]: null });
  const stale = await ctx.newPage();
  // this tab never hears storage events: only the check before each write can save the load
  await stale.addInitScript(() => window.addEventListener("storage", (e) => e.stopImmediatePropagation(), true));
  await stale.goto("/");
  await stale.evaluate(() => (window.before = true));
  const loader = await ctx.newPage();
  await loader.goto("/#save=" + (await encodeBackup(FULL, LEVELS.length)));
  await Promise.all([loader.waitForEvent("load"), loader.locator("#replace-save").click()]);
  const loaded = await both(loader);
  // the stale tab's next game write (sound) reloads it and writes nothing
  await Promise.all([stale.waitForEvent("load"), stale.locator("#sound").click()]);
  expect(await stale.evaluate(() => window.before)).toBeUndefined();
  expect(await both(stale)).toEqual(loaded);
  await expect(stale.locator("#sound")).toHaveText("SOUND ON");
  await ctx.close();
});

test("a save that changed after the preview is shown again before it is replaced", async ({ browser, baseURL }) => {
  const b = await device(browser, baseURL, { [GAME]: JSON.stringify(FRESH_GAME), [SKINS]: null });
  const pb = await b.newPage();
  await pb.goto("/#save=" + (await encodeBackup(FULL, LEVELS.length)));
  await expect(pb.locator("#here-summary")).toHaveText("1 built-in levels played · 1 of your own levels · 0 skins");
  // progress lands on this device after the preview (another tab, say)
  await pb.evaluate(([k, v]) => localStorage.setItem(k, v), [GAME, JSON.stringify({ ...FRESH_GAME, best: { 0: 12, 1: 30 } })]);
  await pb.locator("#replace-save").click();
  await expect(pb.locator("#sheet .move [role=status]").last()).toHaveText("This device's save just changed. Check the numbers again, then tap REPLACE.");
  await expect(pb.locator("#here-summary")).toHaveText("2 built-in levels played · 1 of your own levels · 0 skins");
  expect(JSON.parse(await stored(pb, GAME)).best).toEqual({ 0: 12, 1: 30 });
  await Promise.all([pb.waitForEvent("load"), pb.locator("#replace-save").click()]);
  expect(JSON.parse(await stored(pb, GAME))).toEqual(FULL.game);
  await b.close();
});

test("a load that did not finish says so at the next start and saves nothing until the player picks", async ({ browser, baseURL }) => {
  const b = await device(browser, baseURL, { [GAME]: JSON.stringify(FRESH_GAME), [IMPORT]: JSON.stringify({ state: "pending", id: "x" }) });
  const pb = await b.newPage();
  await pb.goto("/");
  await expect(pb.locator("#sheet-title")).toHaveText("Loading a save didn't finish");
  await expect(pb.locator("#sheet").getByRole("button", { name: "LOAD IT AGAIN" })).toBeVisible();
  // put away without choosing: a game change is not saved, and the choice comes back
  await pb.keyboard.press("Escape");
  await expect(pb.locator("#sheet")).not.toBeVisible();
  await pb.locator("#sound").click();
  await expect(pb.locator("#sheet-title")).toHaveText("Loading a save didn't finish");
  expect(JSON.parse(await stored(pb, GAME))).toEqual(FRESH_GAME);
  await pb.locator("#sheet").getByRole("button", { name: "KEEP WHAT'S HERE" }).click();
  expect(await stored(pb, IMPORT)).toBeNull();
  // saving is back: the unsaved tap left sound on in memory, two more taps end on, and it is stored
  await pb.locator("#sound").click();
  await pb.locator("#sound").click();
  await expect(pb.locator("#sound")).toHaveText("SOUND ON");
  await expect.poll(async () => JSON.parse(await stored(pb, GAME)).sound).toBe(true);
  await b.close();
});

test("KEEP after another tab finished a newer load reloads into that load instead of erasing it", async ({ browser, baseURL }) => {
  const ctx = await device(browser, baseURL, { [GAME]: JSON.stringify(FRESH_GAME), [IMPORT]: JSON.stringify({ state: "pending", id: "x" }) });
  const a = await ctx.newPage();
  // this tab never hears storage events: only KEEP's own check can see the newer load
  await a.addInitScript(() => window.addEventListener("storage", (e) => e.stopImmediatePropagation(), true));
  await a.goto("/");
  await expect(a.locator("#sheet-title")).toHaveText("Loading a save didn't finish");
  // a second tab (it boots to the same choice) loads the save by link
  const b = await ctx.newPage();
  await b.goto("/#save=" + (await encodeBackup(FULL, LEVELS.length)));
  await Promise.all([b.waitForEvent("load"), b.locator("#replace-save").click()]);
  const marker = await stored(b, IMPORT), loaded = await both(b);
  expect(JSON.parse(marker).state).toBe("done");
  await Promise.all([a.waitForEvent("load"), a.locator("#sheet").getByRole("button", { name: "KEEP WHAT'S HERE" }).click()]);
  expect(await stored(a, IMPORT)).toBe(marker);
  expect(await both(a)).toEqual(loaded);
  await ctx.close();
});

test("a device whose own save can't be read can still load a whole save", async ({ browser, baseURL }) => {
  const b = await device(browser, baseURL, { [GAME]: "{broken", [SKINS]: null });
  const pb = await b.newPage();
  await pb.goto("/#save=" + (await encodeBackup(FULL, LEVELS.length)));
  await expect(pb.locator("#here-summary")).toHaveText("A save that can't be read");
  await Promise.all([pb.waitForEvent("load"), pb.locator("#replace-save").click()]);
  expect(await both(pb)).toEqual(FULL);
  await b.close();
});

test("the sheet fits 320 wide and phone landscape with 44px targets; a big save has no QR but a full code", async ({ browser, baseURL }) => {
  const big = structuredClone(FULL);
  big.game.customLevels = Array.from({ length: 30 }, (_, i) => ({
    id: i + 1,
    level: { name: `L${i}`, length: 300, song: 9, objects: Array.from({ length: 120 }, (_, j) => piece(["block", "spike", "grid"][j % 3], 4 + j * 2.3, j % 3)) },
  }));
  big.game.activeLevel = 1;
  big.game.draft = big.game.customLevels[0].level;
  for (const [width, height] of [[320, 568], [844, 390]]) {
    const ctx = await browser.newContext({ baseURL, viewport: { width, height }, hasTouch: true });
    await ctx.addInitScript((s) => { localStorage.setItem("clonedash.v1", s.game); localStorage.setItem("clonedash.skins.v1", s.skins); }, { game: JSON.stringify(big.game), skins: JSON.stringify(big.skins) });
    const page = await ctx.newPage();
    await page.goto("/");
    await openMove(page);
    await expect(page.locator("#save-summary")).toBeVisible();
    await expect(page.locator(".qr-fallback")).toBeVisible();
    await expect(page.locator(".save-qr")).toHaveCount(0);
    await page.locator("#save-code").evaluate((e) => e.closest("details").open = true);
    expect((await page.locator("#save-code").inputValue()).startsWith("cdb1.")).toBe(true);
    for (const view of ["#save-send", "#save-load"]) {
      await page.locator(view).click();
      const m = await page.evaluate(() => {
        const sheet = document.querySelector("#sheet-content");
        const visible = [...sheet.querySelectorAll(".move button, .move a, .move input")].filter((e) => e.getClientRects().length);
        return {
          over: [document.documentElement.scrollWidth - innerWidth, sheet.scrollWidth - sheet.clientWidth],
          small: visible.filter((e) => { const r = e.getBoundingClientRect(); return r.height < 44 || r.width < 44; }).map((e) => e.id || e.textContent),
        };
      });
      expect(m.over, `${width}x${height} ${view}`).toEqual([0, 0]);
      expect(m.small, `${width}x${height} ${view}`).toEqual([]);
    }
    await ctx.close();
  }
});
