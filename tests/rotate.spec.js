import { test, expect } from '@playwright/test';

// Free rotation from the editor: an Angle slider beside Size. The quarter-turn buttons still
// work on top of it. Rings and portals stay quarter-only, so the slider is disabled for them.
const stored = page => page.evaluate(() => JSON.parse(localStorage.getItem('clonedash.v1')));
const slide = (page, id, value) => page.locator(id).evaluate((e, v) => { e.value = String(v); e.dispatchEvent(new Event('input', { bubbles: true })); }, value);

test('the Angle slider rotates a block to any degree, persists it, and the 90° button adds on top', async ({ page }) => {
  await page.addInitScript(() => {
    if (!localStorage.getItem('clonedash.v1')) localStorage.setItem('clonedash.v1', JSON.stringify({ version: 1, best: {}, sound: false, draft: { name: 'Rotate', length: 40, objects: [{ type: 'block', x: 8, y: 1, rotation: 0, flipX: false, flipY: false }, { type: 'ring', x: 12, y: 2, rotation: 0, flipX: false, flipY: false }] } }));
  });
  await page.goto('/'); await page.locator('#editor-open').click();
  await expect(page.locator('#angle')).toBeDisabled();
  await page.locator('#select-tool').click();
  const point = await page.evaluate(() => {
    const top = document.querySelector('.editor-head').getBoundingClientRect().bottom;
    const floor = document.querySelector('.editor-controls').getBoundingClientRect().top - 18;
    const unit = Math.max(12, Math.min((floor - top - 14) / 7, innerWidth / 13.5, 82));
    return { unit, floor };
  });
  await page.mouse.click(8.5 * point.unit, point.floor - 1.5 * point.unit);
  await expect(page.locator('#selection')).toContainText('BLOCK');
  await expect(page.locator('#angle')).toBeEnabled();
  await slide(page, '#angle', 45);
  await expect(page.locator('#selection')).toContainText('45°');
  await expect.poll(async () => (await stored(page)).draft.objects[0].rotation).toBe(45);
  await page.getByRole('button', { name: 'Rotate clockwise', exact: true }).click();
  await expect(page.locator('#selection')).toContainText('315°');
  await page.reload(); await page.locator('#editor-open').click();
  expect((await stored(page)).draft.objects[0].rotation).toBe(315);
  await page.locator('#select-tool').click();
  await page.mouse.click(12.5 * point.unit, point.floor - 2.5 * point.unit);
  await expect(page.locator('#selection')).toContainText('RING');
  await expect(page.locator('#angle')).toBeDisabled();
});
