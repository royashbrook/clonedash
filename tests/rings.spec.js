import { test, expect } from '@playwright/test';

// Three ring presets on the RINGS tab plus the colour and bounce controls on the transform row.
const stored = page => page.evaluate(() => JSON.parse(localStorage.getItem('clonedash.v1')));

test('ring presets stamp colour and bounce; the ring controls edit them and persist', async ({ page }) => {
  await page.goto('/'); await page.locator('#editor-open').click();
  await expect(page.locator('#ring-color')).toBeDisabled(); await expect(page.locator('#bounce')).toBeDisabled();
  const point = await page.evaluate(() => {
    const top = document.querySelector('.editor-head').getBoundingClientRect().bottom;
    const floor = document.querySelector('.editor-controls').getBoundingClientRect().top - 18;
    const unit = Math.max(12, Math.min((floor - top - 14) / 7, innerWidth / 13.5, 82));
    return { unit, floor };
  });
  await page.getByRole('tab', { name: 'RINGS', exact: true }).click();
  for (const [name, x, color, bounce] of [['◉ PURPLE · 1', 5, '#c77dff', 1], ['◉ RED · 5', 8, '#ff5c7a', 5], ['◉ WHITE · CUSTOM', 11, '#ffffff', undefined], ['◉ JUMP RING', 14, undefined, undefined]]) {
    await page.getByRole('button', { name, exact: true }).click();
    await page.mouse.click((x + .1) * point.unit, point.floor - 2.5 * point.unit); // placement rounds to the nearest column
    await expect(page.locator('#selection')).toContainText('RING');
    const piece = (await stored(page)).draft.objects.at(-1);
    expect(piece.type).toBe('ring'); expect(piece.color).toBe(color); expect(piece.bounce).toBe(bounce);
  }
  // the white ring, selected: pick a colour and a height
  await page.locator('#select-tool').click();
  await page.mouse.click((11 + .5) * point.unit, point.floor - 2.5 * point.unit);
  await expect(page.locator('#ring-color')).toBeEnabled(); await expect(page.locator('#ring-color')).toHaveValue('#ffffff');
  await expect(page.locator('#bounce')).toHaveValue('2.25');
  await page.locator('#ring-color').selectOption('GREEN');
  await page.locator('#bounce').evaluate(e => { e.value = '7'; e.dispatchEvent(new Event('input', { bubbles: true })); });
  await expect(page.locator('#selection')).toContainText('↑7');
  await expect.poll(async () => (await stored(page)).draft.objects[2]).toMatchObject({ color: '#9aff6b', bounce: 7 });
  // back to the defaults removes both fields; a block never enables the controls
  await page.locator('#ring-color').selectOption('YELLOW');
  await page.locator('#bounce').evaluate(e => { e.value = '2.25'; e.dispatchEvent(new Event('input', { bubbles: true })); });
  const reset = (await stored(page)).draft.objects[2];
  expect('color' in reset).toBe(false); expect('bounce' in reset).toBe(false);
  await page.reload(); await page.locator('#editor-open').click();
  expect((await stored(page)).draft.objects.map(o => o.bounce)).toEqual([1, 5, undefined, undefined]);
});

test('the dark blue gravity ring places from RINGS, and its bounce stays off', async ({ page }) => {
  await page.goto('/'); await page.locator('#editor-open').click();
  const point = await page.evaluate(() => {
    const top = document.querySelector('.editor-head').getBoundingClientRect().bottom;
    const floor = document.querySelector('.editor-controls').getBoundingClientRect().top - 18;
    const unit = Math.max(12, Math.min((floor - top - 14) / 7, innerWidth / 13.5, 82));
    return { unit, floor };
  });
  await page.getByRole('tab', { name: 'RINGS', exact: true }).click();
  await page.getByRole('button', { name: '◉ DARK BLUE · GRAVITY', exact: true }).click();
  await page.mouse.click((6 + .1) * point.unit, point.floor - 2.5 * point.unit);
  await expect(page.locator('#selection')).toContainText('RING');
  await expect(page.locator('#selection')).toContainText('⇅ GRAVITY');
  expect((await stored(page)).draft.objects.at(-1)).toEqual({ type: 'ring', x: 6, y: 2, rotation: 0, flipX: false, flipY: false, color: '#2b4cff', flipsGravity: true });
  await expect(page.locator('#ring-color')).toBeEnabled(); await expect(page.locator('#ring-color')).toHaveValue('#2b4cff');
  await expect(page.locator('#bounce')).toBeDisabled();
});
