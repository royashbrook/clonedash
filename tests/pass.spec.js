import { test, expect } from '@playwright/test';

// Wall pass and roof pass from the player's side: on the RINGS tab, placed over blocks that are
// already there, drawn with their letter in the editor, invisible in play, and a run that walks
// through a visible wall under a W and jumps up through a visible shelf under an R.
test('W and R zones lie over blocks and let the run through them', async ({ page }) => {
  await page.clock.install();
  await page.addInitScript(() => {
    const piece = (type, x, y = 0) => ({ type, x, y, rotation: 0, flipX: false, flipY: false });
    const wall = [0, 1, 2].map(y => piece('grid', 6, y)), shelf = [12, 13].map(x => piece('grid', x, 2));
    localStorage.setItem('clonedash.v1', JSON.stringify({ version: 1, best: {}, sound: false, draft: { name: 'Pass run', length: 30, objects: [...wall, ...shelf, piece('r-block', 12, 2), piece('r-block', 13, 2)] } }));
  });
  await page.goto('/'); await page.locator('#editor-open').click();
  await page.getByRole('tab', { name: 'RINGS', exact: true }).click();
  await expect(page.getByRole('button', { name: 'R · ROOF PASS', exact: true })).toBeVisible();
  const point = await page.evaluate(() => {
    const top = document.querySelector('.editor-head').getBoundingClientRect().bottom;
    const floor = document.querySelector('.editor-controls').getBoundingClientRect().top - 18;
    const unit = Math.max(12, Math.min((floor - top - 14) / 7, innerWidth / 13.5, 82));
    return { unit, floor };
  });
  // the W goes on top of the wall's own cells instead of selecting the block already there
  await page.getByRole('button', { name: 'W · WALL PASS', exact: true }).click();
  for (const y of [0, 1, 2]) {
    await page.mouse.click(6.1 * point.unit, point.floor - (y + 0.5) * point.unit);
    await expect(page.locator('#selection')).toContainText('WALL PASS');
  }
  await page.locator('#test-level').click();
  // walk through the wall at 6, then tap under the shelf at 12 and pass up through it
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
