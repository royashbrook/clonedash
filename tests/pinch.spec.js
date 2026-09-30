import { test, expect } from '@playwright/test';

// Two fingers on the editor canvas size and turn the selected piece. Pointer events are
// synthesised with two pointer ids, which drives the same handler real fingers do.
const stored = page => page.evaluate(() => JSON.parse(localStorage.getItem('clonedash.v1')));
const finger = (page, type, id, x, y) => page.locator('#world').evaluate((c, o) => {
  c.dispatchEvent(new PointerEvent(o.type, { pointerId: o.id, pointerType: 'touch', isPrimary: o.id === 1, clientX: o.x, clientY: o.y, bubbles: true }));
}, { type, id, x, y });

test('a pinch on the selected block sizes and turns it with snap, freely without, and persists', async ({ page }) => {
  await page.addInitScript(() => {
    if (!localStorage.getItem('clonedash.v1')) localStorage.setItem('clonedash.v1', JSON.stringify({ version: 1, best: {}, sound: false, draft: { name: 'Pinch', length: 40, height: 12, objects: [{ type: 'grid', x: 8, y: 1, rotation: 0, flipX: false, flipY: false }, { type: 'ring', x: 14, y: 2, rotation: 0, flipX: false, flipY: false }] } }));
  });
  await page.goto('/'); await page.locator('#editor-open').click();
  await expect(page.locator('#snap')).toBeChecked();
  await page.locator('#select-tool').click();
  const point = await page.evaluate(() => {
    const top = document.querySelector('.editor-head').getBoundingClientRect().bottom;
    const floor = document.querySelector('.editor-controls').getBoundingClientRect().top - 18;
    const unit = Math.max(12, Math.min((floor - top - 14) / 7, innerWidth / 13.5, 82));
    return { unit, floor, top };
  });
  const bx = 8.5 * point.unit, by = point.floor - 1.5 * point.unit; // the block's centre
  // first finger on the block selects it, second finger starts the pinch
  await finger(page, 'pointerdown', 1, bx, by);
  await expect(page.locator('#selection')).toContainText('GRID');
  await finger(page, 'pointerdown', 2, bx + 100, by);
  // spread to double the distance and swing the second finger 40 degrees up: snap gives 2x and 45
  const a = -40 * Math.PI / 180;
  await finger(page, 'pointermove', 2, bx + 200 * Math.cos(a), by + 200 * Math.sin(a));
  await expect(page.locator('#selection')).toContainText('45° · ×2.00');
  await finger(page, 'pointerup', 2, 0, 0);
  await finger(page, 'pointerup', 1, 0, 0);
  await expect.poll(async () => (await stored(page)).draft.objects[0]).toMatchObject({ scale: 2, rotation: 45 });
  // snap off: the same gesture from the new state lands on whole degrees and 0.05 sizes
  await page.locator('#snap').uncheck();
  await finger(page, 'pointerdown', 1, bx, by);
  await finger(page, 'pointerdown', 2, bx + 100, by);
  const b = -10 * Math.PI / 180;
  await finger(page, 'pointermove', 2, bx + 65 * Math.cos(b), by + 65 * Math.sin(b));
  await expect(page.locator('#selection')).toContainText('55° · ×1.30');
  await finger(page, 'pointerup', 1, 0, 0);
  await finger(page, 'pointerup', 2, 0, 0);
  await page.reload(); await page.locator('#editor-open').click();
  expect((await stored(page)).draft.objects[0]).toMatchObject({ scale: 1.3, rotation: 55 });
  // a ring only quarter-turns and never scales
  await page.locator('#select-tool').click();
  const rx = 14.5 * point.unit, ry = point.floor - 2.5 * point.unit;
  await finger(page, 'pointerdown', 1, rx, ry);
  await expect(page.locator('#selection')).toContainText('RING');
  await finger(page, 'pointerdown', 2, rx + 100, ry);
  await finger(page, 'pointermove', 2, rx, ry + 300);
  await expect(page.locator('#selection')).toContainText('270° · ×1.00');
  await finger(page, 'pointerup', 1, 0, 0);
  await finger(page, 'pointerup', 2, 0, 0);
  const ring = (await stored(page)).draft.objects[1];
  expect(ring.rotation).toBe(270); expect('scale' in ring).toBe(false);
});
