import { test, expect } from '@playwright/test';

// Wall pass and roof pass from the player's side: on the RINGS tab, placed over blocks that are
// already there, invisible in play. A W on a wall stops the run there instead of crashing it, a
// jump clears it, and an R on a roof turns a head hit into a bump.
test('W and R zones lie over blocks: the wall waits, the roof bumps, nobody crashes', async ({ page }) => {
  await page.clock.install();
  await page.addInitScript(() => {
    const piece = (type, x, y = 0) => ({ type, x, y, rotation: 0, flipX: false, flipY: false });
    const roof = [14, 15, 16, 17].map(x => piece('grid', x, 2));
    localStorage.setItem('clonedash.v1', JSON.stringify({ version: 1, best: {}, sound: false, draft: { name: 'Bump run', length: 40, objects: [piece('grid', 6, 0), ...roof, ...roof.map(o => ({ ...o, type: 'r-block' }))] } }));
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
  // the W goes on top of the wall's own cell instead of selecting the block already there
  await page.getByRole('button', { name: 'W · WALL PASS', exact: true }).click();
  await page.mouse.click(6.1 * point.unit, point.floor - 0.5 * point.unit);
  await expect(page.locator('#selection')).toContainText('WALL PASS');
  await page.locator('#test-level').click();
  const x = () => page.locator('#run-progress').evaluate(e => 1 + e.value / 100 * 39);
  // 0.4s ready, then 5 blocks a second: the wall at 6 is reached in about a second and holds
  await page.clock.runFor(3000);
  await expect(page.locator('#attempt')).toHaveText('TRY 1');
  const held = await x();
  expect(held).toBeGreaterThan(5); expect(held).toBeLessThan(6);
  await page.clock.runFor(1000);
  expect(await x()).toBeCloseTo(held, 1);
  // a jump clears the one-block wall and the run carries on
  await page.keyboard.down('Space'); await page.clock.runFor(100); await page.keyboard.up('Space');
  await page.clock.runFor(1500);
  expect(await x()).toBeGreaterThan(8);
  // under the R roof at 14: a jump bumps instead of crashing, and the run keeps going
  while (await x() < 14.4) await page.clock.runFor(20);
  await page.keyboard.down('Space'); await page.clock.runFor(100); await page.keyboard.up('Space');
  await page.clock.runFor(1500);
  await expect(page.locator('#attempt')).toHaveText('TRY 1');
  expect(await x()).toBeGreaterThan(18);
});
