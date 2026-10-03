import { test, expect } from '@playwright/test';

// Outline variants: four presets on the BLOCKS tab (solid blocks) and the Edges control for any
// outlined block. FULL is stored as no field.
const stored = page => page.evaluate(() => JSON.parse(localStorage.getItem('clonedash.v1')));

test('edge presets place solid blocks with an outline variant; the Edges control changes any bordered block', async ({ page }) => {
  await page.goto('/'); await page.locator('#editor-open').click();
  await expect(page.locator('#edges')).toBeDisabled();
  const point = await page.evaluate(() => {
    const top = document.querySelector('.editor-head').getBoundingClientRect().bottom;
    const floor = document.querySelector('.editor-controls').getBoundingClientRect().top - 18;
    const unit = Math.max(12, Math.min((floor - top - 14) / 7, innerWidth / 13.5, 82));
    return { unit, floor };
  });
  const cell = (x, y) => page.mouse.click((x + .1) * point.unit, point.floor - (y + .5) * point.unit);
  for (const [name, x, edges, label] of [['▔ EDGE', 4, 'edge', 'EDGE'], ['═ PARALLEL', 6, 'parallel', 'PARALLEL'], ['┌ OUTER CORNER', 8, 'outer', 'OUTER CORNER'], ['⌜ INNER CORNER', 10, 'inner', 'INNER CORNER']]) {
    await page.getByRole('button', { name, exact: true }).click();
    await cell(x, 0);
    await expect(page.locator('#selection')).toContainText(`BLOCK · x ${x}.00`);
    await expect(page.locator('#selection')).toContainText(`· ${label}`);
    const piece = (await stored(page)).draft.objects.at(-1);
    expect(piece.type).toBe('block'); expect(piece.edges).toBe(edges);
  }
  // the selected inner corner turns like any block
  await page.locator('[data-action="cw"]').click();
  expect((await stored(page)).draft.objects.at(-1)).toMatchObject({ edges: 'inner', rotation: 270 });
  // a grid block takes a variant from the Edges control, and FULL takes it away again
  await page.getByRole('button', { name: '▦ GRID', exact: true }).click();
  await cell(12, 0);
  await expect(page.locator('#edges')).toBeEnabled(); await expect(page.locator('#edges')).toHaveValue('');
  await page.locator('#edges').selectOption('OUTER CORNER');
  await expect.poll(async () => (await stored(page)).draft.objects.at(-1)).toMatchObject({ type: 'grid', edges: 'outer' });
  await page.locator('#edges').selectOption('FULL');
  await expect.poll(async () => 'edges' in (await stored(page)).draft.objects.at(-1)).toBe(false);
  // NO BORDER has no outline to vary
  await page.getByRole('button', { name: '■ NO BORDER', exact: true }).click();
  await cell(14, 0);
  await expect(page.locator('#selection')).toContainText('PLAIN-BLACK');
  await expect(page.locator('#edges')).toBeDisabled();
  await page.reload(); await page.locator('#editor-open').click();
  expect((await stored(page)).draft.objects.map(o => o.edges)).toEqual(['edge', 'parallel', 'outer', 'inner', undefined, undefined]);
});
