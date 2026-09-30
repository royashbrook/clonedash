import { test, expect } from '@playwright/test';

// Speed portals from the player's side: a SPEED tab with all four, and a run through FASTER that
// covers more trail in the same time than the same run without it.
const distance = async (page, objects) => {
  await page.clock.install();
  await page.addInitScript((objects) => {
    localStorage.setItem('clonedash.v1', JSON.stringify({ version: 1, best: {}, sound: false, draft: { name: 'Speed run', length: 200, objects } }));
  }, objects);
  await page.goto('/'); await page.locator('#editor-open').click();
  await page.locator('#test-level').click();
  await page.clock.runFor(900 + 3000);
  await expect(page.locator('#attempt')).toHaveText('TRY 1');
  return page.locator('#run-progress').evaluate(e => 1 + e.value / 100 * 199);
};
const piece = (type, x, y = 0) => ({ type, x, y, rotation: 0, flipX: false, flipY: false });

test('the SPEED tab offers slow, normal, fast and faster', async ({ page }) => {
  await page.goto('/'); await page.locator('#editor-open').click();
  await page.getByRole('tab', { name: 'SPEED', exact: true }).click();
  for (const name of ['< SLOW · 0.8X', '> NORMAL · 1X', '>> FAST · 1.25X', '>>> FASTER · 1.5X'])
    await expect(page.getByRole('button', { name, exact: true })).toBeVisible();
});

test('a FASTER portal carries the run further in the same time', async ({ browser }) => {
  const plain = await browser.newPage(), fast = await browser.newPage();
  const a = await distance(plain, []), b = await distance(fast, [piece('speed-faster', 3)]);
  expect(b - a).toBeGreaterThan(4);
  expect(b / a).toBeGreaterThan(1.3);
});
