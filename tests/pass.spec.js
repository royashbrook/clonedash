import { test, expect } from '@playwright/test';

// W and R blocks from the player's side: on the RINGS tab, drawn with their letter in the
// editor, invisible in play, and a run that walks through a W wall and jumps up through an R.
test('W and R blocks place from the palette, show their letter, and let the run through', async ({ page }) => {
  await page.clock.install();
  await page.addInitScript(() => {
    const piece = (type, x, y = 0) => ({ type, x, y, rotation: 0, flipX: false, flipY: false });
    localStorage.setItem('clonedash.v1', JSON.stringify({ version: 1, best: {}, sound: false, draft: { name: 'Pass run', length: 30, objects: [...[0, 1, 2].map(y => piece('w-block', 6, y)), piece('r-block', 12, 2), piece('r-block', 13, 2)] } }));
  });
  await page.goto('/'); await page.locator('#editor-open').click();
  await page.getByRole('tab', { name: 'RINGS', exact: true }).click();
  await expect(page.getByRole('button', { name: 'W · SIDE PASS', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'R · HEAD PASS', exact: true })).toBeVisible();
  await page.locator('#select-tool').click();
  const point = await page.evaluate(() => {
    const top = document.querySelector('.editor-head').getBoundingClientRect().bottom;
    const floor = document.querySelector('.editor-controls').getBoundingClientRect().top - 18;
    const unit = Math.max(12, Math.min((floor - top - 14) / 7, innerWidth / 13.5, 82));
    return { unit, floor };
  });
  await page.mouse.click(6.5 * point.unit, point.floor - 1.5 * point.unit);
  await expect(page.locator('#selection')).toContainText('W BLOCK');
  await page.locator('#test-level').click();
  // walk through the W wall at 6, then tap under the R shelf at 12 and pass up through it
  await page.clock.runFor(2000); // 0.4s ready, then 5 blocks a second
  const x = () => page.locator('#run-progress').evaluate(e => 1 + e.value / 100 * 29);
  expect(await x()).toBeGreaterThan(8);
  await expect(page.locator('#attempt')).toHaveText('TRY 1');
  while (await x() < 11.6) await page.clock.runFor(20);
  await page.keyboard.down('Space'); await page.clock.runFor(100); await page.keyboard.up('Space');
  await page.clock.runFor(1200);
  expect(await x()).toBeGreaterThan(14);
  await expect(page.locator('#attempt')).toHaveText('TRY 1');
});
