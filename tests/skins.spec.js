import { test, expect } from "@playwright/test";
import jsQR from "jsqr";
import { readFile } from "node:fs/promises";
import { decodeSkin, encodeSkin, lineCells, skinLink } from "../src/skin.ts";
import { encodeLevel } from "../src/transfer.ts";

// The skin creator in a real browser, both engines (docs/skins.md).
const KEY = "clonedash.skins.v1";
const LEVEL_SAVE = {
  version: 1,
  sound: false,
  best: { 0: 100 },
  draft: { name: "Mine", length: 40, objects: [] },
  activeLevel: 1,
  customLevels: [{ id: 1, level: { name: "Mine", length: 40, objects: [] } }],
};
const robot = {
  name: "Robot",
  width: 16,
  height: 8,
  palette: ["#ff5c7a", "#101825"],
  pixels: "1".repeat(64) + "2".repeat(64),
};
const stored = (page, key = KEY) => page.evaluate((k) => localStorage.getItem(k), key);
const skinsOf = async (page) => JSON.parse(await stored(page));
const colours = (skin) => [...skin.pixels].map((c) => (c === "0" ? "" : skin.palette[parseInt(c, 17) - 1]));
async function open(page, { skins, level = LEVEL_SAVE, url = "/" } = {}) {
  await page.addInitScript(
    ({ skins, level, key }) => {
      if (!localStorage.getItem("clonedash.v1")) localStorage.setItem("clonedash.v1", JSON.stringify(level));
      if (skins && !localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(skins));
      Object.defineProperty(navigator, "share", {
        configurable: true,
        value: async (data) => {
          window.sent = { ...data, files: data.files && (await Promise.all(data.files.map((f) => f.text()))) };
        },
      });
      Object.defineProperty(navigator, "canShare", { configurable: true, value: () => true });
      Object.defineProperty(navigator, "clipboard", {
        configurable: true,
        value: { writeText: async (text) => (window.copied = text) },
      });
    },
    { skins, level, key: KEY },
  );
  await page.goto(url);
}
// counts images drawn onto the game canvas, which only a worn skin does
const countWorldImages = (page) =>
  page.addInitScript(() => {
    window.worldImages = 0;
    const draw = CanvasRenderingContext2D.prototype.drawImage;
    CanvasRenderingContext2D.prototype.drawImage = function (...args) {
      if (this.canvas.id === "world") window.worldImages++;
      return draw.apply(this, args);
    };
  });
const worldImages = (page) => page.evaluate(() => window.worldImages);
async function newSkin(page) {
  await page.locator("#skins-open").click();
  await page.locator("#new-skin").click();
  await expect(page.locator("#skin-grid")).toBeVisible();
}
const sheetButton = (page, name) => page.locator("#sheet").getByRole("button", { name, exact: true });
async function clearGrid(page) {
  await page.locator("#clear-skin").click();
  await sheetButton(page, "CLEAR").click();
}
// the centre of a cell in CSS client pixels, read from the grid's own box
const cellPoint = (page, x, y) =>
  page.locator("#skin-grid").evaluate(
    (grid, [x, y]) => {
      const box = grid.getBoundingClientRect(),
        w = +document.querySelector("#skin-width").textContent,
        h = +document.querySelector("#skin-height").textContent;
      return { x: box.left + ((x + 0.5) * box.width) / w, y: box.top + ((y + 0.5) * box.height) / h };
    },
    [x, y],
  );
// a synthesised touch pointer, the way the editor's pinch test drives two fingers
const finger = (page, type, id, at) =>
  page.locator("#skin-grid").evaluate(
    (grid, o) =>
      grid.dispatchEvent(
        new PointerEvent(o.type, { pointerId: o.id, pointerType: "touch", isPrimary: o.id === 11, clientX: o.at.x, clientY: o.at.y, bubbles: true }),
      ),
    { type, id, at },
  );

test("touch paints whole strokes at DPR 3 while scrolled, each cell once; a second finger, cancel or lost capture ends painting", async ({ browser, baseURL }, info) => {
  const context = await browser.newContext({ baseURL, viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, hasTouch: true });
  try {
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await open(page);
    await newSkin(page);
    await clearGrid(page);
    await page.getByRole("button", { name: "RED", exact: true }).click();
    // scroll the screen so the grid sits higher than where it was laid out
    const scrolled = await page.locator("#skins").evaluate((s) => {
      s.scrollTop = 140;
      return s.scrollTop;
    });
    expect(scrolled).toBeGreaterThan(100);
    expect(await page.evaluate(() => devicePixelRatio)).toBe(3);
    const target = await cellPoint(page, 1, 1);
    await page.touchscreen.tap(target.x, target.y);
    await expect(page.locator("#skin-grid")).toHaveAttribute("data-changed", "1");
    // a fast drag: one move from (0,3) straight to (7,6), then back over the same cells
    const a = await cellPoint(page, 0, 3),
      b = await cellPoint(page, 7, 6);
    const line = lineCells(0, 3, 7, 6);
    if (info.project.name === "chromium") {
      const cdp = await context.newCDPSession(page);
      const touch = (type, points) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints: points });
      await touch("touchStart", [{ x: a.x, y: a.y, id: 1 }]);
      await touch("touchMove", [{ x: b.x, y: b.y, id: 1 }]);
      await touch("touchMove", [{ x: a.x, y: a.y, id: 1 }]);
      await touch("touchEnd", []);
      await expect(page.locator("#skin-grid")).toHaveAttribute("data-changed", String(line.length));
      // a second finger mid-stroke ends it: the first finger's later moves paint nothing
      const c = await cellPoint(page, 0, 7),
        d = await cellPoint(page, 7, 7);
      await touch("touchStart", [{ x: c.x, y: c.y, id: 1 }]);
      await touch("touchStart", [{ x: c.x, y: c.y, id: 1 }, { x: d.x, y: d.y, id: 2 }]);
      await touch("touchMove", [{ x: d.x, y: d.y, id: 1 }, { x: d.x, y: d.y, id: 2 }]);
      await touch("touchEnd", []);
    } else {
      await finger(page, "pointerdown", 11, a);
      await finger(page, "pointermove", 11, b);
      await finger(page, "pointermove", 11, a);
      await finger(page, "pointerup", 11, a);
      await expect(page.locator("#skin-grid")).toHaveAttribute("data-changed", String(line.length));
      const c = await cellPoint(page, 0, 7),
        d = await cellPoint(page, 7, 7);
      await finger(page, "pointerdown", 11, c);
      await finger(page, "pointerdown", 12, d);
      await finger(page, "pointermove", 11, d);
      await finger(page, "pointerup", 12, d);
      await finger(page, "pointerup", 11, d);
    }
    // cancel and lost capture end a stroke too (both engines, synthesised)
    const e0 = await cellPoint(page, 6, 0),
      e1 = await cellPoint(page, 7, 0),
      f0 = await cellPoint(page, 4, 7),
      f1 = await cellPoint(page, 5, 7);
    await finger(page, "pointerdown", 11, e0);
    await finger(page, "pointercancel", 11, e0);
    await finger(page, "pointermove", 11, e1);
    await finger(page, "pointerdown", 11, f0);
    await page.locator("#skin-grid").evaluate((g) => g.dispatchEvent(new PointerEvent("lostpointercapture", { pointerId: 11, bubbles: true })));
    await finger(page, "pointermove", 11, f1);
    await finger(page, "pointerup", 11, f1);
    await page.locator("#skin-name").fill("Touch");
    await page.locator("#save-skin").click();
    await expect(page.locator("#skin-message")).toHaveText("Saved.");
    const saved = (await skinsOf(page)).skins[0].skin;
    const expected = Array(64).fill("");
    for (const [x, y] of [[1, 1], ...line, [0, 7], [6, 0], [4, 7]]) expected[y * 8 + x] = "#ff5c7a";
    expect(colours(saved)).toEqual(expected);
    expect(errors).toEqual([]);
  } finally {
    await context.close();
  }
});

test("resize, save, reload, use, blank drafts, delete back to the green cube; the level save is never written", async ({ browser, baseURL }) => {
  const context = await browser.newContext({ baseURL, viewport: { width: 932, height: 430 }, hasTouch: true });
  try {
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await countWorldImages(page);
    await open(page);
    const levelBefore = await stored(page, "clonedash.v1");
    await page.waitForTimeout(300);
    expect(await worldImages(page), "the default cube draws no image").toBe(0);
    expect(await stored(page)).toBeNull();
    await newSkin(page);
    for (let i = 0; i < 8; i++) await page.locator("#width-more").tap();
    await expect(page.locator("#skin-width")).toHaveText("16");
    // shrinking off the starter's bottom row asks first; KEEP IT keeps it
    await page.locator("#height-less").tap();
    await expect(page.locator("#sheet")).toContainText("Make it smaller?");
    await sheetButton(page, "KEEP IT").click();
    await expect(page.locator("#skin-height")).toHaveText("8");
    await page.locator("#height-less").tap();
    await sheetButton(page, "CUT IT OFF").click();
    await expect(page.locator("#skin-height")).toHaveText("7");
    await page.locator("#skin-name").fill("Wide one");
    await page.locator("#save-skin").tap();
    await expect(page.locator("#skin-message")).toHaveText("Saved.");
    let s = await skinsOf(page);
    expect(s.skins).toHaveLength(1);
    expect(s.skins[0].skin).toMatchObject({ name: "Wide one", width: 16, height: 7 });
    expect(s.selected).toBeUndefined();
    // the starter's top-left 8x7 survived the resize; the new columns are empty
    const kept = colours(s.skins[0].skin);
    expect(kept.slice(0, 8)).toEqual(Array(8).fill("#ffffff"));
    expect(kept.slice(8, 16)).toEqual(Array(8).fill(""));
    await page.locator("#use-skin").tap();
    await expect(page.locator("#skin-message")).toHaveText("Saved. You are wearing it now.");
    s = await skinsOf(page);
    expect(s.selected).toBe(s.skins[0].id);
    await page.reload();
    // the worn skin draws on the home screen's cube and in play
    await expect.poll(() => worldImages(page)).toBeGreaterThan(0);
    await page.locator("#play").click();
    const inPlay = await worldImages(page);
    await expect.poll(() => worldImages(page)).toBeGreaterThan(inPlay + 10);
    await page.locator("#menu").click();
    await page.getByRole("button", { name: "MAIN MENU", exact: true }).click();
    await page.locator("#skins-open").click();
    await expect(page.getByRole("button", { name: "Use Wide one", exact: true })).toHaveText("WEARING");
    // a blank skin saves as a draft but can't be worn
    await page.locator("#new-skin").click();
    await clearGrid(page);
    await page.locator("#use-skin").tap();
    await expect(page.locator("#skin-message")).toContainText("Draw at least one pixel");
    expect((await skinsOf(page)).skins).toHaveLength(1);
    await page.locator("#skin-name").fill("Blank");
    await page.locator("#save-skin").tap();
    expect((await skinsOf(page)).skins).toHaveLength(2);
    // leaving with unsaved changes asks
    await page.locator("#tool-fill").tap();
    const at = await cellPoint(page, 0, 0);
    await page.touchscreen.tap(at.x, at.y);
    await page.locator("#skin-done").tap();
    await sheetButton(page, "LEAVE").click();
    expect(colours((await skinsOf(page)).skins[1].skin).every((c) => c === "")).toBe(true);
    await expect(page.getByRole("button", { name: "Use Blank" })).toBeDisabled();
    // copy, then delete the worn skin: back to the green cube
    await page.getByRole("button", { name: "Copy Wide one", exact: true }).tap();
    expect((await skinsOf(page)).skins.map((e) => e.skin.name)).toEqual(["Wide one", "Blank", "Wide one (copy)"]);
    await page.getByRole("button", { name: "Delete Wide one", exact: true }).tap();
    await expect(page.locator("#sheet")).toContainText("go back to the green cube");
    await sheetButton(page, "DELETE SKIN").click();
    s = await skinsOf(page);
    expect(s.skins.map((e) => e.skin.name)).toEqual(["Blank", "Wide one (copy)"]);
    expect(s.selected).toBeUndefined();
    await expect(page.getByRole("button", { name: "Use Green cube" })).toHaveText("WEARING");
    await page.reload();
    await page.waitForTimeout(300);
    expect(await worldImages(page), "back to the procedural cube").toBe(0);
    await page.locator("#skins-open").click();
    await expect(page.getByRole("button", { name: "Use Green cube" })).toHaveText("WEARING");
    expect(await stored(page, "clonedash.v1")).toBe(levelBefore);
    expect(errors).toEqual([]);
  } finally {
    await context.close();
  }
});

// stale-tab preservation (docs/skins.md storage): sequential writes from tabs opened earlier, not
// overlapping ones, which web storage cannot make safe
test("stale-tab journey: both tabs open, A adds, B adds and changes the selection, both reloaded keep both; level save unchanged", async ({ browser, baseURL }) => {
  const context = await browser.newContext({ baseURL, viewport: { width: 932, height: 430 } });
  try {
    const [a, b] = [await context.newPage(), await context.newPage()];
    await open(a);
    await open(b);
    const levelBefore = await stored(a, "clonedash.v1");
    await newSkin(a);
    await newSkin(b); // tab b opened its editor before tab a saved anything
    await a.locator("#skin-name").fill("From A");
    await a.locator("#save-skin").click();
    await expect(a.locator("#skin-message")).toHaveText("Saved.");
    await b.locator("#skin-name").fill("From B");
    await b.locator("#use-skin").click();
    await expect(b.locator("#skin-message")).toHaveText("Saved. You are wearing it now.");
    const both = await skinsOf(a);
    expect(both.skins.map((e) => [e.id, e.skin.name])).toEqual([[1, "From A"], [2, "From B"]]);
    expect(both.selected).toBe(2);
    expect(await stored(a, "clonedash.v1")).toBe(levelBefore);
    for (const tab of [a, b]) {
      await tab.reload();
      await tab.locator("#skins-open").click();
      await expect(tab.locator(".skin-card h2")).toHaveText(["Green cube", "From A", "From B"]);
      await expect(tab.getByRole("button", { name: "Use From B", exact: true })).toHaveText("WEARING");
    }
    expect(await stored(b, "clonedash.v1")).toBe(levelBefore);
    await a.getByRole("button", { name: "Edit From A", exact: true }).click();
    await b.getByRole("button", { name: "Edit From B", exact: true }).click();
    // tab a renames its skin from a stale view; tab b's skin and choice survive
    await a.locator("#skin-name").fill("A renamed");
    await a.locator("#save-skin").click();
    const after = await skinsOf(b);
    expect(after.skins.map((e) => e.skin.name)).toEqual(["A renamed", "From B"]);
    expect(after.selected).toBe(2);
    // a level/progress write in tab a (the sound setting persists the whole level save)
    const skinsRaw = await stored(a);
    await a.locator("#skin-done").click();
    await a.locator("#skins-back").click();
    await a.locator("#sound").click();
    expect(JSON.parse(await stored(a, "clonedash.v1")).sound).toBe(true);
    expect(await stored(a)).toBe(skinsRaw);
    await b.reload();
    await b.locator("#skins-open").click();
    await expect(b.locator(".skin-card h2")).toHaveText(["Green cube", "A renamed", "From B"]);
  } finally {
    await context.close();
  }
});

test("share paths round-trip: QR link, code, file, the My Levels import; previews first, adds new, never wears", async ({ browser, baseURL }) => {
  const sender = await browser.newContext({ baseURL, viewport: { width: 932, height: 430 } });
  const receiver = await browser.newContext({ baseURL, viewport: { width: 430, height: 932 } });
  try {
    const page = await sender.newPage();
    await open(page, { skins: { version: 1, next: 4, skins: [{ id: 3, skin: robot }], selected: 3 } });
    await page.locator("#skins-open").click();
    await page.getByRole("button", { name: "Share Robot" }).click();
    await expect(page.locator(".level-qr")).toBeVisible();
    await expect(page.locator("#send-level")).toHaveText("SHARE SKIN");
    await page.locator("#send-level").click();
    const sent = await page.evaluate(() => window.sent);
    expect(sent.text).toBe("Wear my Cube Dash skin");
    expect(new URL(sent.url).hash).toMatch(/^#skin=cds1\./);
    expect(await decodeSkin(sent.url)).toEqual(robot);
    const pixels = await page.locator(".level-qr").evaluate((image) => {
      const canvas = document.createElement("canvas");
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(image, 0, 0);
      return { w: canvas.width, h: canvas.height, data: [...ctx.getImageData(0, 0, canvas.width, canvas.height).data] };
    });
    const scanned = jsQR(new Uint8ClampedArray(pixels.data), pixels.w, pixels.h);
    expect(scanned?.data).toBe(sent.url);
    await page.locator("#copy-level").click();
    const code = await page.evaluate(() => window.copied);
    expect(await decodeSkin(code)).toEqual(robot);
    const downloadWait = page.waitForEvent("download");
    await page.locator(".download-level").click();
    const download = await downloadWait;
    expect(download.suggestedFilename()).toBe("cube-dash-skin.clonedash.txt");
    const bytes = await readFile(await download.path());
    expect(bytes.toString()).toBe(code);

    // the receiver already has a skin with the same name, and wears another
    const mine = { ...robot, palette: ["#53e3ff", "#ffffff"] };
    const r = await receiver.newPage();
    await open(r, { skins: { version: 1, next: 3, skins: [{ id: 1, skin: mine }, { id: 2, skin: { ...mine, name: "Other" } }], selected: 2 } });
    const before = await stored(r);
    const levelBefore = await stored(r, "clonedash.v1");
    await r.goto(scanned.data);
    await expect(r.getByRole("dialog")).toContainText("Robot");
    await expect(r.locator("#add-skin")).toBeVisible();
    expect(new URL(r.url()).hash).toBe("");
    expect(await stored(r)).toBe(before);
    await r.locator("#add-skin").click();
    let s = await skinsOf(r);
    expect(s.skins.map((e) => [e.id, e.skin.name])).toEqual([[1, "Robot"], [2, "Other"], [3, "Robot"]]);
    expect(s.skins[0].skin).toEqual(mine);
    expect(s.skins[2].skin).toEqual(robot);
    expect(s.selected).toBe(2);
    // the code, pasted into IMPORT SKIN
    await r.locator("#import-skin").click();
    await r.locator("#import-code").fill(code);
    await r.locator("#preview-level").click();
    await r.locator("#add-skin").click();
    // the file, through the My Levels import (one sheet tells levels and skins apart)
    await r.locator("#skins-back").click();
    await r.locator("#my-levels").click();
    await r.locator("#import-level").click();
    await r.locator("#level-file").setInputFiles({ name: "friend.clonedash.txt", mimeType: "text/plain", buffer: bytes });
    await r.locator("#add-skin").click();
    await expect(r.locator("#skins")).toBeVisible();
    s = await skinsOf(r);
    expect(s.skins.map((e) => e.id)).toEqual([1, 2, 3, 4, 5]);
    expect(s.skins.slice(2).every((e) => JSON.stringify(e.skin) === JSON.stringify(robot))).toBe(true);
    expect(s.selected).toBe(2);
    expect(await stored(r, "clonedash.v1")).toBe(levelBefore);
    // a level code still imports as a level through the same sheet
    await r.locator("#skins-back").click();
    await r.locator("#my-levels").click();
    await r.locator("#import-level").click();
    await r.locator("#import-code").fill(await encodeLevel({ name: "Still a level", length: 40, objects: [] }));
    await r.locator("#preview-level").click();
    await expect(r.locator("#add-level")).toBeVisible();
    await expect(r.locator("#add-skin")).toHaveCount(0);
    // ambiguous and duplicate links are refused before anything is written
    const raw = await stored(r);
    const level = await encodeLevel({ name: "L", length: 40, objects: [] });
    for (const bad of [`https://e.test/#level=${level}&skin=${code}`, `https://e.test/#skin=${code}&skin=${code}`]) {
      await r.locator("#import-code").fill(bad);
      await r.locator("#preview-level").click();
      await expect(r.locator(".transfer .failed")).toBeVisible();
      await expect(r.locator("#add-skin")).toHaveCount(0);
      await expect(r.locator("#add-level")).toHaveCount(0);
    }
    await r.locator("#sheet-close").click();
    await r.goto(`/#level=${level}&skin=${code}`);
    await expect(r.locator(".transfer .failed")).toContainText("one level");
    expect(await stored(r)).toBe(raw);
  } finally {
    await sender.close();
    await receiver.close();
  }
});

test("a worst-case 32x32 noise skin gets no QR but its complete code and file", async ({ page }) => {
  let seed = 107;
  const rand = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32;
  const noise = {
    name: "Noise",
    width: 32,
    height: 32,
    palette: Array.from({ length: 16 }, (_, i) => `#${(0x123456 + i * 0x0b0a09).toString(16).slice(-6)}`),
    pixels: Array.from({ length: 1024 }, () => "0123456789abcdefg"[Math.floor(rand() * 17)]).join(""),
  };
  await open(page, { skins: { version: 1, next: 2, skins: [{ id: 1, skin: noise }] } });
  await page.locator("#skins-open").click();
  await page.getByRole("button", { name: "Share Noise" }).click();
  await expect(page.locator(".qr-fallback")).toBeVisible();
  await expect(page.locator(".level-qr")).toHaveCount(0);
  await page.locator("#copy-level").click();
  expect(await decodeSkin(await page.evaluate(() => window.copied))).toEqual(noise);
  expect(skinLink(await encodeSkin(noise), "https://clonedash.royashbrook.com/").length).toBeGreaterThan(1000);
});

test("the creator fits 320 wide and phone landscape: no sideways scroll, 44px targets, the whole editor reachable", async ({ browser, baseURL }) => {
  for (const [width, height] of [[320, 568], [932, 430], [844, 390]]) {
    const context = await browser.newContext({ baseURL, viewport: { width, height }, hasTouch: true });
    try {
      const page = await context.newPage();
      const shapes = [[32, 4], [4, 32], [32, 32]].map(([w, h], i) => ({
        id: i + 2,
        skin: { name: `Shape ${w}x${h}`, width: w, height: h, palette: ["#ffd166"], pixels: "1".repeat(w * h) },
      }));
      await open(page, {
        skins: { version: 1, next: 5, skins: [{ id: 1, skin: { ...robot, name: "A long skin name that wraps on a phone!" } }, ...shapes] },
      });
      await page.locator("#skins-open").click();
      const measure = () =>
        page.evaluate(() => {
          const screen = document.querySelector("#skins");
          const visible = [...screen.querySelectorAll("button, input")].filter((e) => e.getClientRects().length);
          return {
            doc: document.documentElement.scrollWidth,
            body: document.body.scrollWidth,
            screenOver: screen.scrollWidth - screen.clientWidth,
            short: visible.filter((e) => e.getBoundingClientRect().height < 44).map((e) => e.id || e.ariaLabel || e.textContent),
            narrow: visible.filter((e) => e.getBoundingClientRect().width < 44).map((e) => e.id || e.ariaLabel || e.textContent),
            scrollHeight: screen.scrollHeight,
            clientHeight: screen.clientHeight,
            viewport: [innerWidth, innerHeight],
          };
        });
      let m = await measure();
      expect(m.viewport).toEqual([width, height]);
      expect([m.doc, m.body, m.screenOver]).toEqual([width, width, 0]);
      expect(m.short).toEqual([]);
      expect(m.narrow).toEqual([]);
      for (const [w, h] of [[32, 4], [4, 32], [32, 32]]) {
        await page.getByRole("button", { name: `Edit Shape ${w}x${h}`, exact: true }).click();
        await expect(page.locator("#skin-width")).toHaveText(String(w));
        await expect(page.locator("#skin-height")).toHaveText(String(h));
        m = await measure();
        expect([m.doc, m.body, m.screenOver], `${width}x${height} ${w}x${h}`).toEqual([width, width, 0]);
        expect(m.short).toEqual([]);
        expect(m.narrow).toEqual([]);
        const grid = await page.locator("#skin-grid").boundingBox();
        expect(grid.x).toBeGreaterThanOrEqual(0);
        expect(grid.x + grid.width).toBeLessThanOrEqual(width);
        const [cw, ch] = await page.locator("#skin-grid").evaluate((g) => [g.clientWidth, g.clientHeight]);
        expect(cw / ch, "square cells").toBeCloseTo(w / h, 5);
        // every control is reachable by scrolling the screen, and nothing is cut off sideways
        for (const selector of ["#skin-grid", "#use-skin", "#clear-skin", "#height-more", "#skin-preview", ".hint"]) {
          await page.locator(selector).scrollIntoViewIfNeeded();
          const box = await page.locator(selector).boundingBox();
          expect(box.x, selector).toBeGreaterThanOrEqual(0);
          expect(box.x + box.width, selector).toBeLessThanOrEqual(width + 0.5);
          expect(box.y + Math.min(box.height, height) , selector).toBeLessThanOrEqual(height + 0.5);
          expect(box.y + Math.min(box.height, 44), selector).toBeGreaterThan(0);
        }
        await page.screenshot({ path: `test-results/skins-${width}x${height}-${w}x${h}-${test.info().project.name}.png` });
        await page.locator("#skin-done").click();
      }
      await page.locator("#skins").evaluate((s) => (s.scrollTop = 0));
      await page.screenshot({ path: `test-results/skins-${width}x${height}-${test.info().project.name}.png` });
    } finally {
      await context.close();
    }
  }
});
