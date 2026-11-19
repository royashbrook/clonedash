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

for (const [name, viewport, insets] of phones)
  test(`the loop editor's name, PLAY and SAVE stay on screen through scrolling, typing and coming back: ${name}`, async ({ page, browserName }) => {
    test.skip(browserName !== "chromium", "safe-area insets can only be emulated in Chromium");
    await phone(page, viewport, insets);
    await page.goto("/");
    await page.locator("#loops-open").click();
    await page.locator("#new-loop").click();
    const bar = [page.locator("#loop-name"), page.locator("#loop-play"), page.locator("#save-loop")];
    const check = async () => { for (const b of bar) await inside(b, viewport, insets); };
    await check();
    await scrollOver(page, page.locator("#loop-grid"));
    expect(await page.locator(".loop-body").evaluate((e) => e.scrollTop), "the body scrolled").toBeGreaterThan(0);
    await check();
    await page.locator("#loop-name").focus();
    await page.locator("#loop-name").fill("Phone loop");
    await page.locator("#loop-name").blur();
    await check();
    // back to the list and into the loop again, without turning the phone
    await page.locator("#loop-done").click();
    await page.locator("#sheet").getByRole("button", { name: "LEAVE", exact: true }).click(); // the name changed
    await page.locator("#new-loop").click();
    await check();
  });
