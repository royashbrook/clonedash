import { test, expect, tool } from "./quiet.mjs";

async function open(page, width, height) {
  await page.setViewportSize({ width, height });
  await page.goto("/");
  await page.locator("#loops-open").click();
  await page.locator("#new-loop").click();
  await tool(page, "#loop-length-32");
}

test("32 steps fit the tablet workspace; phones and narrow split views page, without covering the dock", async ({ page }) => {
  await open(page, 390, 844);
  for (const [width, height, visible] of [
    [390, 844, 8], [438, 1024, 8], [744, 1133, 32], [1133, 744, 32],
    [768, 1024, 32], [1024, 768, 32], [1024, 1366, 32], [1366, 1024, 32],
    [800, 700, 24], [1440, 900, 32],
  ]) {
    await page.setViewportSize({ width, height });
    const steps = page.locator("#loop-grid .step");
    await expect(steps, `${width}x${height}`).toHaveCount(visible);
    await expect(page.locator(".pages button")).toHaveCount(visible === 32 ? 0 : Math.ceil(32 / visible));
    await expect.poll(async () => page.locator("#loop-grid .cell").evaluateAll(cells => {
      const boxes = cells.map(c => c.getBoundingClientRect());
      const dock = document.querySelector("#dock").getBoundingClientRect();
      const bad = boxes.find(b => b.width < 30 || b.height < 22 || b.right > innerWidth || b.bottom > dock.top || b.top < 0);
      return bad ? { width: innerWidth, height: innerHeight, bad: bad.toJSON(), dock: dock.top } : dock.bottom > innerHeight ? "dock clipped" : "fit";
    }), {message: `${width}x${height} visible pads and dock`}).toBe("fit");
    if (visible === 24) {
      await page.getByRole("button", {name: "Steps 25 to 32"}).click();
      await expect(steps).toHaveText(["25","26","27","28","29","30","31","32"]);
    }
  }
});

test("a stroke crosses adjacent bars, edits survive repaging, and resize leaves playback running", async ({ page }) => {
  await open(page, 744, 1133);
  await expect(page.locator("#loop-grid .step")).toHaveCount(32);
  const pad = step => page.getByRole("button", { name: `note 5 step ${step}`, exact: true });
  const point = async step => { const r = await pad(step).boundingBox(); return [r.x + r.width / 2, r.y + r.height / 2]; };
  const a = await point(24), b = await point(25);
  expect(a[1]).toBe(b[1]);
  await page.locator("#loop-swipe").click();
  await page.mouse.move(...a);
  await page.mouse.down();
  await page.mouse.move(...b, { steps: 3 });
  await page.mouse.up();
  for (const step of [24,25]) await expect(pad(step)).toHaveAttribute("aria-pressed", "true");
  await page.setViewportSize({width:390,height:844});
  for (const [tab, step] of [[3,24],[4,25]]) {
    await page.locator("#loop-page-" + tab).click();
    await expect(pad(step)).toHaveAttribute("aria-pressed", "true");
  }
  await page.setViewportSize({width:1133,height:744});
  // Stop the live audio clock at step six. A resize must neither restart it nor seek;
  // advancing the same clock then lights step seven. No race with the real beat.
  await page.evaluate(() => {
    window.audioTime = 0;
    Object.defineProperty(AudioContext.prototype, "currentTime", { get: () => window.audioTime });
  });
  await page.clock.install({time: 0});
  await page.clock.pauseAt(test.info().timeout);
  const lit = page.locator(".step.now");
  const time = async t => {
    await page.evaluate(n => { window.audioTime = n; }, t);
    await page.clock.runFor(50);
  };
  await page.locator("#loop-play").click();
  await time(0.07);
  await expect(lit).toHaveText("1");
  await time(1.04);

  await time(1.08);
  await expect(lit).toHaveText("6");
  await page.setViewportSize({width:744,height:1133});
  await expect(page.locator("#loop-play")).toHaveAttribute("aria-pressed", "true");
  await expect(lit).toHaveText("6");
  await time(1.2);

  await time(1.28);
  await expect(lit).toHaveText("7");
  await page.locator("#loop-play").click();
});
