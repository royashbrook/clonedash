import { test, expect } from "./quiet.mjs";

// The bottom bar on the menu screens (#133, the house pattern in kidgames STANDARD.md): a tab per
// screen, MORE for the rest, never over play or the editor, every target at least 44px.
test("each tab opens its screen and shows which one is open; MORE holds how to play and about", async ({ page }) => {
  await page.goto("/");
  const current = () => page.locator('#dock [aria-current="page"]').textContent();
  expect((await current()).trim()).toBe("PLAY");
  for (const [id, screen, label] of [["#my-levels", "#library", "BUILD"], ["#skins-open", "#skins", "LOOKS"], ["#loops-open", "#loops", "MUSIC"], ["#dock-play", "#home", "PLAY"]]) {
    await page.locator(id).click();
    await expect(page.locator(screen)).toBeVisible();
    expect((await current()).trim()).toBe(label);
  }
  for (const box of await page.locator("#dock button").evaluateAll((all) => all.map((b) => b.getBoundingClientRect())))
    expect(Math.min(box.width, box.height)).toBeGreaterThanOrEqual(44);
  await page.locator("#more").click();
  const sheet = page.locator("#sheet");
  await expect(sheet.getByRole("button", { name: "HOW TO PLAY", exact: true })).toBeVisible();
  await expect(sheet.getByRole("button", { name: "ABOUT, UPDATES AND YOUR SAVE", exact: true })).toBeVisible();
});

test("the bar is gone while playing and in the editor, and back on the menus", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("#dock")).toBeVisible();
  await page.locator("#play").click();
  await expect(page.locator("#hud")).toBeVisible();
  await expect(page.locator("#dock")).toHaveCount(0);
  await page.locator("#pause").click();
  await expect(page.locator("#dock")).toHaveCount(0);
  await page.goto("/");
  await page.locator("#editor-open").click();
  await expect(page.locator("#editor-back")).toBeVisible();
  await expect(page.locator("#dock")).toHaveCount(0);
  await page.locator("#editor-back").click();
  await expect(page.locator("#dock")).toBeVisible();
});

// a tab would leave an open skin without its editor's own ask, so the bar steps aside there
test("an open skin hides the bar and its own back still asks", async ({ page }) => {
  await page.goto("/");
  await page.locator("#skins-open").click();
  await expect(page.locator("#dock")).toBeVisible();
  await page.locator("#new-skin").click();
  await expect(page.locator("#skin-name")).toBeVisible();
  await expect(page.locator("#dock")).toHaveCount(0);
  expect(await page.locator("#skins").evaluate((e) => parseFloat(getComputedStyle(e).paddingBottom))).toBeLessThan(60);
  await page.locator("#skin-name").fill("Mine");
  await page.locator("#skin-done").click();
  const sheet = page.locator("#sheet");
  await expect(sheet).toContainText("Leave without saving?");
  await sheet.getByRole("button", { name: "LEAVE", exact: true }).click();
  await expect(page.locator("#new-skin")).toBeVisible();
  await expect(page.locator("#dock")).toBeVisible();
});

// the loop editor keeps the bar (#140): a tab leaves through the editor's own ask
test("an open loop keeps the bar; a tab asks before leaving changes, KEEP IT keeps them, LEAVE goes there", async ({ page }) => {
  await page.goto("/");
  await page.locator("#loops-open").click();
  await page.locator("#new-loop").click();
  await expect(page.locator("#dock")).toBeVisible();
  await expect(page.locator("#dock [aria-current=page]")).toHaveText(/MUSIC/);
  // an unchanged loop: a tab just goes
  await page.locator("#my-levels").click();
  await expect(page.locator("#library")).toBeVisible();
  await page.locator("#loops-open").click();
  await page.locator("#new-loop").click();
  await page.locator("#loop-name").fill("Keep me");
  await page.getByRole("button", { name: "note 5 step 2", exact: true }).click();
  const notes = () => page.locator("#loop-grid .cell[aria-pressed=true]").evaluateAll((all) => all.map((c) => c.getAttribute("aria-label")));
  const before = await notes();
  // HELP and MORE open over the draft and keep it
  await page.locator("#loop-help").click();
  await page.locator("#loop-help-panel").getByRole("button", { name: "GOT IT", exact: true }).click();
  await page.locator("#more").click();
  await page.locator("#sheet-close").click();
  await expect(page.locator("#loop-name")).toHaveValue("Keep me");
  expect(await notes()).toEqual(before);
  // a tab asks; KEEP IT stays with everything as it was
  const sheet = page.locator("#sheet");
  await page.locator("#skins-open").click();
  await expect(sheet).toContainText("Leave without saving?");
  await sheet.getByRole("button", { name: "KEEP IT", exact: true }).click();
  await expect(page.locator("#loop-name")).toHaveValue("Keep me");
  expect(await notes()).toEqual(before);
  // LEAVE goes to the tab that was tapped
  await page.locator("#skins-open").click();
  await sheet.getByRole("button", { name: "LEAVE", exact: true }).click();
  await expect(page.locator("#skins")).toBeVisible();
  await expect(page.locator("#dock [aria-current=page]")).toHaveText(/LOOKS/);
});

test("MORE over the loop list silences a loop that is playing", async ({ page }) => {
  await page.addInitScript((store) => {
    localStorage.setItem("clonedash.loops.v1", store);
    // every node of a live context wired to its destination and not yet cut (as loops.spec.js)
    const outs = new Set(), connect = AudioNode.prototype.connect, disconnect = AudioNode.prototype.disconnect;
    AudioNode.prototype.connect = function (target, ...rest) {
      if (this.context instanceof AudioContext && target === this.context.destination) outs.add(this);
      return connect.call(this, target, ...rest);
    };
    AudioNode.prototype.disconnect = function (...a) {
      outs.delete(this);
      return disconnect.apply(this, a);
    };
    window.liveOutputs = () => outs.size;
  }, JSON.stringify({ version: 1, next: 2, loops: [{ id: 1, loop: { name: "Beat", root: 43, wobble: 3, drop: false, notes: [[0], [], [12], [], [7], [], [3], []], kick: [0, 4], snare: [2, 6], hat: [1, 3, 5, 7] } }] }));
  await page.goto("/");
  await page.locator("#loops-open").click();
  await page.getByRole("button", { name: "Play Beat", exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.liveOutputs())).toBe(1);
  await page.locator("#more").click();
  await expect(page.locator("#sheet")).toBeVisible();
  expect(await page.evaluate(() => window.liveOutputs())).toBe(0);
});

// a phone with its notch and home indicator (emulated in Chromium only, see portrait-home.spec.js)
const phones = [
  ["upright", { width: 420, height: 912 }, { top: 62, bottom: 34, left: 0, right: 0 }],
  ["sideways", { width: 912, height: 420 }, { top: 0, bottom: 21, left: 62, right: 62 }],
];
async function phone(page, viewport, insets) {
  await page.setViewportSize(viewport);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Emulation.setSafeAreaInsetsOverride", { insets });
}
// a finger's scroll over an element: whatever scrolls there scrolls, as on a phone
async function scrollOver(page, locator) {
  const b = await locator.boundingBox();
  await page.mouse.move(b.x + b.width / 2, b.y + Math.min(b.height / 2, 120));
  for (let i = 0; i < 8; i++) await page.mouse.wheel(0, 800);
  await page.waitForTimeout(100);
}
const inside = async (locator, viewport, insets) => {
  const r = await locator.evaluate((e) => { const b = e.getBoundingClientRect(); return { top: b.top, bottom: b.bottom }; });
  expect(r.top).toBeGreaterThanOrEqual(insets.top);
  expect(r.bottom).toBeLessThanOrEqual(viewport.height - insets.bottom);
};

for (const [name, viewport, insets] of phones)
  test(`home header stays put while the trails scroll: ${name}`, async ({ page, browserName }) => {
    test.skip(browserName !== "chromium", "safe-area insets can only be emulated in Chromium");
    await phone(page, viewport, insets);
    await page.goto("/");
    const head = page.locator("#home > .home-head");
    const before = await head.evaluate((e) => e.getBoundingClientRect().top);
    await scrollOver(page, page.locator(".level-panel"));
    expect(await page.locator(".home-content").evaluate((e) => e.scrollTop + e.querySelector("#levels").scrollTop)).toBeGreaterThan(0);
    expect(await head.evaluate((e) => e.getBoundingClientRect().top)).toBe(before);
  });

// the loop editor on a phone held upright (#140): a new loop's 8 steps and all 13 rows fit between
// the toolbar and the bar, nothing scrolls, the edge cells take taps, and that holds through typing a
// name and coming back to the loop. a short sideways screen scrolls the grid under a fixed toolbar.
const uprightPhones = [
  ["390x844", { width: 390, height: 844 }, { top: 47, bottom: 34, left: 0, right: 0 }],
  ["420x912", { width: 420, height: 912 }, { top: 62, bottom: 34, left: 0, right: 0 }],
  ["320x568", { width: 320, height: 568 }, { top: 20, bottom: 0, left: 0, right: 0 }],
];
for (const [name, viewport, insets] of uprightPhones)
  test(`a new loop fits a phone held upright, through typing and coming back: ${name}`, async ({ page, browserName }) => {
    test.skip(browserName !== "chromium", "safe-area insets can only be emulated in Chromium");
    await phone(page, viewport, insets);
    await page.goto("/");
    await page.locator("#loops-open").click();
    await page.locator("#new-loop").click();
    const fits = async () => {
      const m = await page.evaluate(() => {
        const cells = [...document.querySelectorAll("#loop-grid .cell")].map((c) => c.getBoundingClientRect());
        const r = (s) => document.querySelector(s).getBoundingClientRect();
        return { n: cells.length, left: Math.min(...cells.map((c) => c.left)), right: Math.max(...cells.map((c) => c.right)), bottom: Math.max(...cells.map((c) => c.bottom)), top: Math.min(...cells.map((c) => c.top)), toolbar: r(".loop-toolbar").bottom, dock: r("#dock").top, scroll: document.querySelector(".loop-stage").scrollHeight - document.querySelector(".loop-stage").clientHeight };
      });
      expect(m.n).toBe(8 * 13);
      expect(m.left).toBeGreaterThanOrEqual(0);
      expect(m.right).toBeLessThanOrEqual(viewport.width);
      expect(m.top).toBeGreaterThanOrEqual(m.toolbar);
      expect(m.bottom).toBeLessThanOrEqual(m.dock);
      expect(m.scroll, "nothing scrolls").toBeLessThanOrEqual(0);
      for (const b of [page.locator("#loop-name"), page.locator("#loop-play"), page.locator("#save-loop")]) await inside(b, viewport, insets);
    };
    await fits();
    // the corner cells take taps
    for (const label of ["note 10 step 1", "note 10 step 8", "kick step 1", "kick step 8"]) {
      const c = page.getByRole("button", { name: label, exact: true });
      const was = await c.getAttribute("aria-pressed");
      await c.click();
      await expect(c).not.toHaveAttribute("aria-pressed", was);
    }
    await page.locator("#loop-name").focus();
    await page.locator("#loop-name").fill("Phone loop");
    await page.locator("#loop-name").blur();
    await fits();
    await page.locator("#loop-done").click();
    await page.locator("#sheet").getByRole("button", { name: "LEAVE", exact: true }).click();
    await page.locator("#new-loop").click();
    await fits();
  });

test("sideways on a phone: the toolbar stays and the grid scrolls to its last row", async ({ page, browserName }) => {
  test.skip(browserName !== "chromium", "safe-area insets can only be emulated in Chromium");
  const [, viewport, insets] = phones[1];
  await phone(page, viewport, insets);
  await page.goto("/");
  await page.locator("#loops-open").click();
  await page.locator("#new-loop").click();
  const stage = page.locator(".loop-stage");
  await scrollOver(page, stage);
  for (const b of [page.locator("#loop-name"), page.locator("#loop-play"), page.locator("#save-loop")]) await inside(b, viewport, insets);
  const last = page.getByRole("button", { name: "kick step 8", exact: true });
  const r = await last.boundingBox(), dock = await page.locator("#dock").boundingBox();
  expect(r.y + r.height).toBeLessThanOrEqual(dock.y);
});
