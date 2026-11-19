import { expect } from '@playwright/test';

// For a test that moves the game only with clock.runFor (#113): install the fake clock at time 0
// before navigation, call this after it. It pauses the clock at the test's own timeout, so the
// clock never runs by itself while the test is alive, and checks that real waiting moves nothing.
export async function pauseClock(page, info) {
  await page.clock.pauseAt(info.timeout);
  const before = await page.evaluate(() => Date.now());
  await page.waitForTimeout(300);
  expect(await page.evaluate(() => Date.now()), 'the paused clock moved on its own').toBe(before);
}
