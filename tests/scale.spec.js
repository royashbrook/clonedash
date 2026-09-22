import { test, expect } from '@playwright/test';

// Smooth scaling from the editor: a Size slider on the transform row. Scale 1 is stored as
// "no field" so old levels stay byte-identical; rings and portals cannot be scaled.
const stored = page => page.evaluate(() => JSON.parse(localStorage.getItem('clonedash.v1')));
const slide = (page, value) => page.locator('#scale').evaluate((e, v) => { e.value = String(v); e.dispatchEvent(new Event('input', { bubbles: true })); }, value);

test('the Size slider scales a block smoothly, shows it in the readout, persists it, and clears at 1', async ({ page }) => {
  await page.addInitScript(() => {
    // seed once: init scripts run on every navigation, and the reload below must keep the saved scale
    if (!localStorage.getItem('clonedash.v1')) localStorage.setItem('clonedash.v1', JSON.stringify({ version: 1, best: {}, sound: false, draft: { name: 'Scale', length: 40, objects: [{ type: 'grid', x: 8, y: 1, rotation: 0, flipX: false, flipY: false }, { type: 'ring', x: 12, y: 2, rotation: 0, flipX: false, flipY: false }] } }));
  });
  await page.goto('/'); await page.locator('#editor-open').click();
  await expect(page.locator('#scale')).toBeDisabled(); // nothing selected
  await page.locator('#select-tool').click();
  const point = await page.evaluate(() => {
    const top = document.querySelector('.editor-head').getBoundingClientRect().bottom;
    const floor = document.querySelector('.editor-controls').getBoundingClientRect().top - 18;
    const unit = Math.max(12, Math.min((floor - top - 14) / 7, innerWidth / 13.5, 82));
    return { unit, floor };
  });
  await page.mouse.click((8 + .5) * point.unit, point.floor - 1.5 * point.unit);
  await expect(page.locator('#selection')).toContainText('GRID');
  await expect(page.locator('#scale')).toBeEnabled();
  await slide(page, 2.5);
  await expect(page.locator('#selection')).toContainText('×2.50');
  await expect.poll(async () => (await stored(page)).draft.objects[0].scale).toBe(2.5);
  await page.reload(); await page.locator('#editor-open').click();
  expect((await stored(page)).draft.objects[0].scale).toBe(2.5);
  // back to 1 removes the field entirely
  await page.locator('#select-tool').click();
  await page.mouse.click((8 + .5) * point.unit, point.floor - 1.5 * point.unit);
  await slide(page, 1);
  await expect(page.locator('#selection')).toContainText('×1.00');
  expect('scale' in (await stored(page)).draft.objects[0]).toBe(false);
  // a ring cannot be scaled
  await page.mouse.click((12 + .5) * point.unit, point.floor - 2.5 * point.unit);
  await expect(page.locator('#selection')).toContainText('RING');
  await expect(page.locator('#scale')).toBeDisabled();
});
