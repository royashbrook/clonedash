import { test, expect } from '@playwright/test';

// EDIT OBJECT (#90) and the new RINGS presets: green (#89), pink dash (#91), yellow dash (#92).
const stored = page => page.evaluate(() => JSON.parse(localStorage.getItem('clonedash.v1')));
const grid = async page => {
  const point = await page.evaluate(() => {
    const top = document.querySelector('.editor-head').getBoundingClientRect().bottom;
    const floor = document.querySelector('.editor-controls').getBoundingClientRect().top - 18;
    return { unit: Math.max(12, Math.min((floor - top - 14) / 7, innerWidth / 13.5, 82)), floor };
  });
  return (x, y) => page.mouse.click((x + .1) * point.unit, point.floor - (y + .5) * point.unit);
};

test('EDIT OBJECT switches NO TOUCH, WALL PASS and ROOF PASS on the selected piece', async ({ page }) => {
  await page.goto('/'); await page.locator('#editor-open').click();
  await expect(page.locator('#edit-object')).toBeDisabled();
  const cell = await grid(page);
  await cell(5, 0);
  await page.locator('#edit-object').click();
  const sheet = page.locator('dialog');
  await expect(sheet).toContainText('NO TOUCH OFF');
  await sheet.getByRole('button', { name: 'NO TOUCH: TURN ON' }).click();
  await sheet.getByRole('button', { name: 'ROOF PASS: TURN ON' }).click();
  await expect(sheet).toContainText('NO TOUCH ON'); await expect(sheet).toContainText('ROOF PASS ON');
  expect((await stored(page)).draft.objects[0]).toMatchObject({ type: 'block', noTouch: true, roofPass: true });
  await sheet.getByRole('button', { name: 'NO TOUCH: TURN OFF' }).click();
  await sheet.getByRole('button', { name: 'DONE' }).click();
  const piece = (await stored(page)).draft.objects[0];
  expect('noTouch' in piece).toBe(false); expect(piece.roofPass).toBe(true);
  await expect(page.locator('#selection')).toContainText('ROOF PASS');
  // a spike only offers what fits it
  await page.getByRole('tab', { name: 'SPIKES', exact: true }).click();
  await page.getByRole('button', { name: '▲ FULL', exact: true }).click();
  await cell(8, 0);
  await page.locator('#edit-object').click();
  await expect(sheet.getByRole('button', { name: 'NO TOUCH: TURN ON' })).toBeVisible();
  await expect(sheet.getByRole('button', { name: /WALL PASS/ })).toHaveCount(0);
  await expect(sheet.getByRole('button', { name: /ROOF PASS/ })).toHaveCount(0);
});

test('the green ring and both dash orbs place from RINGS; a dash orb takes any angle', async ({ page }) => {
  await page.goto('/'); await page.locator('#editor-open').click();
  const cell = await grid(page);
  await page.getByRole('tab', { name: 'RINGS', exact: true }).click();
  for (const [name, x, fields] of [
    ['◉ GREEN · GRAVITY + BOUNCE', 5, { color: '#9aff6b', flipsGravity: true, boost: true }],
    ['➤ PINK · DASH', 8, { color: '#ff8ac4', dash: true }],
    ['➤ YELLOW · DASH + GRAVITY', 11, { dash: true, flipsGravity: true }],
  ]) {
    await page.getByRole('button', { name, exact: true }).click();
    await cell(x, 2);
    expect((await stored(page)).draft.objects.at(-1)).toEqual({ type: 'ring', x, y: 2, rotation: 0, flipX: false, flipY: false, ...fields });
    await expect(page.locator('#bounce')).toBeDisabled();
  }
  await expect(page.locator('#selection')).toContainText('DASH + GRAVITY');
  await expect(page.locator('#angle')).toBeEnabled();
  await page.locator('#angle').evaluate(e => { e.value = '37'; e.dispatchEvent(new Event('input', { bubbles: true })); });
  await expect.poll(async () => (await stored(page)).draft.objects.at(-1).rotation).toBe(37);
});

test('EDIT OBJECT turns HIDDEN on; the croissant portal places from PORTALS and plays (#96, #97)', async ({ page }) => {
  await page.goto('/'); await page.locator('#editor-open').click();
  const cell = await grid(page);
  await cell(5, 0);
  await page.locator('#edit-object').click();
  const sheet = page.locator('dialog');
  await sheet.getByRole('button', { name: 'HIDDEN: TURN ON' }).click();
  await expect(sheet).toContainText('HIDDEN ON');
  await sheet.getByRole('button', { name: 'DONE' }).click();
  expect((await stored(page)).draft.objects[0]).toMatchObject({ type: 'block', hidden: true });
  await expect(page.locator('#selection')).toContainText('HIDDEN');
  await page.getByRole('tab', { name: 'PORTALS', exact: true }).click();
  await page.getByRole('button', { name: '☾ CROISSANT', exact: true }).click();
  await cell(3, 0);
  expect((await stored(page)).draft.objects.at(-1)).toMatchObject({ type: 'croissant', x: 3, y: 0 });
  await page.screenshot({ path: 'test-results/hidden-editor.png' });
});
