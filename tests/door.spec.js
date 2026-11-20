import { test, expect } from './quiet.mjs';

test('place the Door portal, test the level, and see the hold instruction', async ({ page }) => {
  await page.clock.install({ time: 0 });
  await page.addInitScript(() => localStorage.setItem('clonedash.v1', JSON.stringify({
    version: 1, best: {}, sound: false, draft: { name: 'Door test', length: 40, objects: [] },
  })));
  await page.goto('/');
  await page.clock.pauseAt(test.info().timeout);
  await page.locator('#editor-open').click();
  await page.getByRole('tab', { name: 'PORTALS', exact: true }).click();
  await page.getByRole('button', { name: /DOOR/ }).click();
  const [x, y] = await page.evaluate(() => {
    const top = document.querySelector('.editor-head').getBoundingClientRect().bottom;
    const floor = document.querySelector('.editor-controls').getBoundingClientRect().top - 18;
    const unit = Math.max(12, Math.min((floor - top - 14) / 7, innerWidth / 13.5, 82));
    return [3.1 * unit, floor - 0.5 * unit];
  });
  await page.mouse.click(x, y);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('clonedash.v1')).draft.objects.map(o => [o.type, o.x, o.y]))).toEqual([['door', 3, 0]]);
  await page.locator('#test-level').click();
  await page.clock.runFor(1000);
  await expect(page.locator('#level-name')).toContainText('DOOR ↓');
  await expect(page.locator('#cue')).toContainText('HOLD TO JUMP HIGHER');
});
