import { test, expect } from '@playwright/test';

// Multi-select (#87): MULTI taps add pieces to the group, a swipe adds a box of them, and the
// move, turn, copy and delete buttons act on the whole group.
const stored = page => page.evaluate(() => JSON.parse(localStorage.getItem('clonedash.v1')));

test('MULTI taps and swipes build a group that moves, copies and deletes together', async ({ page }) => {
  await page.goto('/'); await page.locator('#editor-open').click();
  const point = await page.evaluate(() => {
    const top = document.querySelector('.editor-head').getBoundingClientRect().bottom;
    const floor = document.querySelector('.editor-controls').getBoundingClientRect().top - 18;
    const unit = Math.max(12, Math.min((floor - top - 14) / 7, innerWidth / 13.5, 82));
    return { unit, floor };
  });
  const at = (x, y) => [(x + .5) * point.unit, point.floor - (y + .5) * point.unit];
  const tap = (x, y) => page.mouse.click(...at(x, y));
  // a row of four blocks and one up top
  for (const [x, y] of [[4, 0], [5, 0], [6, 0], [7, 0], [5, 2]]) await tap(x - .4, y);
  expect((await stored(page)).draft.objects).toHaveLength(5);
  await page.locator('#multi-tool').click();
  await expect(page.locator('#multi-tool')).toHaveAttribute('aria-pressed', 'true');
  // taps add to what is already selected (the block just placed), a second tap takes one back out
  await tap(4, 0); await tap(6, 0);
  await expect(page.locator('#selection')).toContainText('3 PIECES');
  await tap(5, 2);
  await expect(page.locator('#selection')).toContainText('2 PIECES');
  await tap(4, 0);
  await expect(page.locator('#selection')).toContainText('BLOCK · x 6.00');
  // a swipe over the top block and the middle of the row adds them all
  await tap(10, 4); await expect(page.locator('#selection')).not.toContainText('PIECES');
  const [x1, y1] = at(4.6, 2.6), [x2, y2] = at(6.4, -0.2);
  await page.mouse.move(x1, y1); await page.mouse.down();
  await page.mouse.move((x1 + x2) / 2, (y1 + y2) / 2); await page.mouse.move(x2, y2); await page.mouse.up();
  await expect(page.locator('#selection')).toContainText('3 PIECES');
  // they move as one
  await page.locator('[data-action="up"]').click();
  await expect.poll(async () => (await stored(page)).draft.objects.map(o => [o.x, o.y]))
    .toEqual([[4, 0], [5, 1], [6, 1], [7, 0], [5, 3]]);
  // copy puts all three to the right, and the copies become the group
  await page.locator('#duplicate-object').click();
  await expect.poll(async () => (await stored(page)).draft.objects.slice(5).map(o => [o.x, o.y]))
    .toEqual([[7, 1], [8, 1], [7, 3]]);
  await expect(page.locator('#selection')).toContainText('3 PIECES');
  // delete takes the whole group
  await page.locator('#delete-object').click();
  await expect.poll(async () => (await stored(page)).draft.objects).toHaveLength(5);
  await expect(page.locator('#delete-object')).toBeDisabled();
  // SELECT is still one piece at a time
  await page.locator('#select-tool').click();
  await tap(4, 0); await tap(7, 0);
  await expect(page.locator('#selection')).toContainText('BLOCK · x 7.00');
});
