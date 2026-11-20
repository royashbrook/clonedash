import { test, expect } from "./quiet.mjs";

test.use({ isMobile: true, hasTouch: true, viewport: { width: 390, height: 844 } });
for (const id of ["menu", "pause"]) {
  test(`a tap on ${id} pauses the moving trail upright`, async ({ page }) => {
    await page.goto("/");
    await page.locator("#play").tap();
    await expect.poll(() => page.locator("#run-progress").evaluate(el => el.value)).toBeGreaterThan(0);
    await page.locator("#" + id).tap();
    await expect(page.getByRole("heading", { name: "Paused" })).toBeVisible({timeout: 3000});
  });
  test(`a second finger can use ${id} while holding a jump`, async ({ page, context, browserName }) => {
    test.skip(browserName !== "chromium", "native multi-touch injection requires CDP");
    await page.goto("/");
    await page.locator("#play").tap();
    const rect = await page.locator("#" + id).boundingBox();
    const cdp = await context.newCDPSession(page);
    const held = { id: 1, x: 180, y: 440 };
    const button = { id: 2, x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
    const touch = (type, touchPoints) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints });
    try {
      await touch("touchStart", [held]);
      await touch("touchStart", [held, button]);
      await touch("touchEnd", [button]);
      await expect(page.getByRole("heading", { name: "Paused" })).toBeVisible({timeout: 3000});
    } finally { await touch("touchEnd", []); }
  });
}
