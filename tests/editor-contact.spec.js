import { test, expect } from '@playwright/test';
import { labelOf } from '../src/types.ts';

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

for (const mode of ['square', 'plane', 'wheel', 'jumper']) test(`${mode} wall impact dies and restarts instead of stopping at the wall`, async ({ page }) => {
  await page.clock.install();
  await page.addInitScript(mode => {
    const piece = (type, x, y = 0) => ({ type, x, y, rotation: 0, flipX: false, flipY: false });
    localStorage.setItem('clonedash.v1', JSON.stringify({ version: 1, best: {}, sound: false, draft: { name: 'Wall impact', length: 20, objects: [piece(mode, 3), ...[0, 1, 2, 3].map(y => piece('outline', 6, y))] } }));
  }, mode);
  await page.goto('/'); await page.locator('#editor-open').click(); await page.locator('#test-level').click();
  await page.clock.runFor(1500); await expect(page.locator('#attempt')).toHaveText('TRY 1');
  await expect(page.locator('#level-name')).toContainText(labelOf(mode)); // shown name, not the stored id
  const x = () => page.locator('#run-progress').evaluate(e => 1 + e.value / 100 * 19);
  const hit = await x(); expect(hit).toBeGreaterThan(6 - .64); expect(hit).toBeLessThan(6);
  await page.keyboard.down('Space'); await page.clock.runFor(120); await page.keyboard.up('Space');
  expect(await x()).toBe(hit);
  await page.clock.runFor(700); await expect(page.locator('#attempt')).toHaveText('TRY 2');
  expect(await x()).toBeLessThan(3);
});
