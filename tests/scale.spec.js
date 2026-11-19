import { test, expect } from '@playwright/test';

// Width and height from the editor (#117): two sliders on the transform row, each its own axis.
// 1 by 1 is stored as "no field" so an unsized piece stays byte-identical; a piece sized with the
// older single Size slider (#106) keeps that field until an edit really changes its size or turn.
const stored = page => page.evaluate(() => JSON.parse(localStorage.getItem('clonedash.v1')));
const slide = (page, id, value) => page.locator(id).evaluate((e, v) => { e.value = String(v); e.dispatchEvent(new Event('input', { bubbles: true })); }, value);
const block = (x, y, extra = {}) => ({ type: 'grid', x, y, rotation: 0, flipX: false, flipY: false, ...extra });

test('the Width and Height sliders size a block one axis each, show it in the readout, persist it, and clear at 1 by 1', async ({ page }) => {
  await page.addInitScript(([objects]) => {
    // seed once: init scripts run on every navigation, and the reload below must keep the saved size
    if (!localStorage.getItem('clonedash.v1')) localStorage.setItem('clonedash.v1', JSON.stringify({ version: 1, best: {}, sound: false, draft: { name: 'Scale', length: 40, objects } }));
  }, [[block(8, 1), { type: 'ring', x: 12, y: 2, rotation: 0, flipX: false, flipY: false }]]);
  await page.goto('/'); await page.locator('#editor-open').click();
  await expect(page.locator('#scale-x')).toBeDisabled(); // nothing selected
  await expect(page.locator('#scale-y')).toBeDisabled();
  await page.locator('#select-tool').click();
  const point = await page.evaluate(() => {
    const top = document.querySelector('.editor-head').getBoundingClientRect().bottom;
    const floor = document.querySelector('.editor-controls').getBoundingClientRect().top - 18;
    const unit = Math.max(12, Math.min((floor - top - 14) / 7, innerWidth / 13.5, 82));
    return { unit, floor };
  });
  await page.mouse.click((8 + .5) * point.unit, point.floor - 1.5 * point.unit);
  await expect(page.locator('#selection')).toContainText('GRID');
  await slide(page, '#scale-x', 2.5);
  await expect(page.locator('#selection')).toContainText('2.50 × 1.00');
  // an unsized piece needs no move: at 1 by 1 both kinds of size are the same shape
  await expect.poll(async () => (await stored(page)).draft.objects[0]).toEqual(block(8, 1, { scaleX: 2.5, scaleY: 1 }));
  await slide(page, '#scale-y', 2.5);
  await expect(page.locator('#selection')).toContainText('×2.50');
  await page.reload(); await page.locator('#editor-open').click();
  expect((await stored(page)).draft.objects[0]).toEqual(block(8, 1, { scaleX: 2.5, scaleY: 2.5 }));
  // back to 1 by 1 removes both fields
  await page.locator('#select-tool').click();
  await page.mouse.click((8 + .5) * point.unit, point.floor - 1.5 * point.unit);
  await slide(page, '#scale-x', 1);
  await slide(page, '#scale-y', 1);
  await expect(page.locator('#selection')).toContainText('×1.00');
  expect((await stored(page)).draft.objects[0]).toEqual(block(8, 1));
  // a ring takes a height of its own
  await page.mouse.click((12 + .5) * point.unit, point.floor - 2.5 * point.unit);
  await expect(page.locator('#selection')).toContainText('RING');
  await slide(page, '#scale-y', 1.5);
  await expect.poll(async () => (await stored(page)).draft.objects[1]).toMatchObject({ scaleX: 1, scaleY: 1.5 });
  expect('scale' in (await stored(page)).draft.objects[1]).toBe(false);
});

test('a single-scale block keeps its field until a slider really changes it, then grows from its middle with its shape where it was (#117)', async ({ page }) => {
  // a size 2 block at x 20, y 1 grows from its base: its middle is at 21, 2.5
  await page.addInitScript(([objects]) => {
    if (!localStorage.getItem('clonedash.v1')) localStorage.setItem('clonedash.v1', JSON.stringify({ version: 1, best: {}, sound: false, draft: { name: 'Old', length: 40, objects } }));
  }, [[block(20, 1, { scale: 2 })]]);
  await page.goto('/'); await page.locator('#editor-open').click();
  await page.locator('#pan').evaluate((e) => { e.value = '14'; e.dispatchEvent(new Event('input', { bubbles: true })); });
  await page.locator('#select-tool').click();
  const point = await page.evaluate(() => {
    const top = document.querySelector('.editor-head').getBoundingClientRect().bottom;
    const floor = document.querySelector('.editor-controls').getBoundingClientRect().top - 18;
    const unit = Math.max(12, Math.min((floor - top - 14) / 7, innerWidth / 13.5, 82));
    return { unit, floor };
  });
  await page.mouse.click((21 - 14) * point.unit, point.floor - 2.5 * point.unit);
  await expect(page.locator('#selection')).toContainText('GRID');
  const before = JSON.stringify((await stored(page)).draft);
  // the value it already has is no edit
  await slide(page, '#scale-x', 2);
  await slide(page, '#angle', 0);
  expect(JSON.stringify((await stored(page)).draft)).toBe(before);
  await slide(page, '#scale-x', 3);
  await expect.poll(async () => (await stored(page)).draft.objects[0]).toEqual(block(20, 1.5, { scaleX: 3, scaleY: 2 }));
});
