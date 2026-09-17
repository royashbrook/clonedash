import { test, expect } from "@playwright/test";

test("version stays top-right without covering phone controls", async ({
  page,
}) => {
  for (const [width, height] of [
    [932, 430],
    [844, 390],
    [640, 360],
  ]) {
    await page.setViewportSize({ width, height });
    await page.goto("/");
    for (const next of ["home", "editor", "play"]) {
      if (next === "editor") await page.locator("#editor-open").click();
      if (next === "play") await page.locator("#test-level").click();
      const overlaps = await page.locator(".version").evaluate((badge) => {
        const v = badge.getBoundingClientRect();
        return [...document.querySelectorAll("button,input,select")]
          .filter((el) => el.checkVisibility())
          .filter((el) => {
            const r = el.getBoundingClientRect();
            return (
              Math.min(v.right, r.right) > Math.max(v.left, r.left) &&
              Math.min(v.bottom, r.bottom) > Math.max(v.top, r.top)
            );
          })
          .map((el) => el.id);
      });
      expect(overlaps, `${width}/${next}`).toEqual([]);
    }
  }
});

test("cancelled touch clears a queued jump, not only the held state", async ({
  page,
}) => {
  await page.clock.install();
  await page.addInitScript(() => {
    const fill = CanvasRenderingContext2D.prototype.fillRect;
    CanvasRenderingContext2D.prototype.fillRect = function (x, y, w, h) {
      if (this.fillStyle === "#9aff6b" && w === h && w > 20 && w < 60)
        window.lastPlayerY = this.getTransform().f;
      return fill.call(this, x, y, w, h);
    };
  });
  await page.goto("/");
  await page.locator("#play").click();
  await page.clock.runFor(600);
  const y = await page.evaluate(() => window.lastPlayerY);
  // Cancel in the same event task after the canvas handler queues the jump. A separate
  // Playwright action can cross a WebKit frame and turn this into cancellation after takeoff.
  await page.evaluate(() =>
    window.addEventListener(
      "pointerdown",
      (e) => {
        e.target.dispatchEvent(
          new PointerEvent("pointercancel", { pointerId: e.pointerId }),
        );
      },
      { once: true },
    ),
  );
  await page.mouse.move(500, 200);
  await page.mouse.down();
  await page.mouse.up();
  await page.clock.runFor(100);
  expect(await page.evaluate(() => window.lastPlayerY)).toBe(y);
  await page.mouse.click(500, 200);
  await page.clock.runFor(100);
  expect(await page.evaluate(() => window.lastPlayerY)).toBeLessThan(y - 5);
});
