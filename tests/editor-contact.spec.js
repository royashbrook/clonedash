import { test, expect } from '@playwright/test';

test('copy + paste preserves transforms; delete all cancels safely and clears only the draft when confirmed', async ({ page }) => {
  await page.addInitScript(() => {
    if (!localStorage.getItem('clonedash.v1')) localStorage.setItem('clonedash.v1', JSON.stringify({ version: 1, best: { 0: 100 }, sound: false, draft: { name: 'Copy test', length: 40, objects: [{ type: 'half', x: 5, y: 2, rotation: 90, flipX: true, flipY: true }] } }));
  });
  await page.goto('/'); await page.locator('#editor-open').click();
  await expect(page.locator('#duplicate-object')).toBeDisabled();
  await page.locator('#select-tool').click();
  const point = await page.evaluate(() => {
    const top = document.querySelector('.editor-head').getBoundingClientRect().bottom;
    const floor = document.querySelector('.editor-controls').getBoundingClientRect().top - 18;
    const unit = Math.max(12, Math.min((floor - top - 14) / 7, innerWidth / 13.5, 82));
    return { x: 5.5 * unit, y: floor - 2.25 * unit };
  });
  await page.mouse.click(point.x, point.y); await page.locator('#duplicate-object').click();
  await expect(page.locator('#selection')).toContainText('x 6.00');
  await page.locator('#duplicate-object').click();
  const saved = () => page.evaluate(() => JSON.parse(localStorage.getItem('clonedash.v1')));
  const copied = await saved(); expect(copied.draft.objects.map(o => o.x)).toEqual([5, 6, 7]);
  expect(copied.draft.objects.every(o => o.rotation === 90 && o.flipX && o.flipY && o.y === 2)).toBe(true);
  await page.locator('#delete-all').click(); await page.getByRole('button', { name: 'CANCEL', exact: true }).click();
  expect(await saved()).toEqual(copied);
  await page.reload(); await page.locator('#editor-open').click(); expect(await saved()).toEqual(copied);
  await page.locator('#delete-all').click(); await page.getByRole('button', { name: 'DELETE ALL OBJECTS', exact: true }).click();
  const cleared = await saved(); expect(cleared.draft.objects).toEqual([]); expect(cleared.best).toEqual({ 0: 100 });
  expect(cleared.draft.name).toBe('Copy test'); expect(cleared.draft.length).toBe(40);
  await expect(page.locator('#delete-all')).toBeDisabled(); await expect(page.locator('#duplicate-object')).toBeDisabled();
  await page.reload(); await page.locator('#editor-open').click(); expect(await saved()).toEqual(cleared);
});

test('jumper stops safely at a real block wall and a tap jumps over it', async ({ page }) => {
  await page.clock.install();
  await page.addInitScript(() => localStorage.setItem('clonedash.v1', JSON.stringify({ version: 1, best: {}, sound: false, draft: { name: 'Safe wall', length: 20, objects: ['jumper', 'outline'].map((type, i) => ({ type, x: i ? 6 : 3, y: 0, rotation: 0, flipX: false, flipY: false })) } })));
  await page.goto('/'); await page.locator('#editor-open').click(); await page.locator('#test-level').click();
  await page.clock.runFor(2200); await expect(page.locator('#attempt')).toHaveText('TRY 1');
  await expect(page.locator('#level-name')).toContainText('JUMPER');
  const x = () => page.locator('#run-progress').evaluate(e => 1 + e.value / 100 * 19);
  expect(await x()).toBeCloseTo(6 - .64, 3);
  await page.keyboard.down('Space'); await page.clock.runFor(40); await page.keyboard.up('Space');
  await page.clock.runFor(850); expect(await x()).toBeGreaterThan(7);
  await expect(page.locator('#attempt')).toHaveText('TRY 1');
  await page.clock.runFor(3000); await expect(page.getByRole('heading', { name: 'Level Complete!' })).toBeVisible();
});
