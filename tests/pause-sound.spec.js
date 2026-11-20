import { test, expect } from "./quiet.mjs";

test("pause controls sound; resume wakes suspended music only when enabled", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => {
    window.wakes = 0;
    const resume = AudioContext.prototype.resume;
    AudioContext.prototype.resume = function (...args) {
      window.lastAudio = this;
      window.wakes++;
      return resume.apply(this, args);
    };
  });
  await page.goto("/");
  await page.locator("#play").click();
  await page.locator("#pause").click();
  const sheet = page.locator("#sheet");
  const button = name => sheet.getByRole("button", { name, exact: true });
  const progress = () => page.locator("#run-progress").evaluate(el => el.value);
  const held = await progress();
  const attempt = await page.locator("#attempt").textContent();
  await button("Turn sound on").click();
  await expect(button("Turn sound off")).toHaveText("SOUND ON");
  expect(await progress()).toBe(held);
  await page.evaluate(() => window.lastAudio.suspend());
  const before = await page.evaluate(() => window.wakes);
  await button("RESUME").click();
  await expect.poll(() => page.evaluate(() => window.lastAudio.state)).toBe("running");
  expect(await page.evaluate(() => window.wakes)).toBeGreaterThan(before);
  await expect(page.locator("#attempt")).toHaveText(attempt);
  await page.locator("#pause").click();
  await button("Turn sound off").click();
  await expect(button("Turn sound on")).toHaveText("SOUND OFF");
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("clonedash.v1")).sound)).toBe(false);
  const muted = await page.evaluate(() => window.wakes);
  await button("RESUME").click();
  await expect(sheet).toBeHidden();
  expect(await page.evaluate(() => window.wakes)).toBe(muted);
});
