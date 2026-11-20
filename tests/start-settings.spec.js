import { test, expect } from './quiet.mjs';

test('build past the finish, keep the piece and start the test run as a fast Door', async ({ page }) => {
  await page.setViewportSize({ width: 844, height: 390 });
  await page.goto('/');
  await page.locator('#editor-open').click();
  await page.locator('#level-settings').click();
  const outside = page.getByRole('checkbox', {name:'Build outside the trail'});
  await page.getByLabel('Starting mode').selectOption('door');
  await page.getByLabel('Starting speed').selectOption('1.5');
  await outside.check();
  const draft = () => page.evaluate(() => JSON.parse(localStorage.getItem('clonedash.v1')).draft);
  const length = (await draft()).length;
  await page.locator('#jump-x').fill(String(length));
  await page.locator('#jump-x').press('Tab');
  await page.locator('#sheet-close').click();
  const point = await page.evaluate(() => {
    const top = document.querySelector('.editor-head').getBoundingClientRect().bottom,
      floor = document.querySelector('.editor-controls').getBoundingClientRect().top - 18,
      unit = Math.max(12, Math.min((floor-top-14)/7, innerWidth/13.5, 82));
    return [3.1*unit, floor-0.5*unit];
  });
  await page.mouse.click(...point);
  await expect.poll(async () => (await draft()).objects.some(p => p.x === length+3)).toBe(true);
  await page.reload();
  await page.locator('#editor-open').click();
  await page.locator('#level-settings').click();
  await expect(page.getByLabel('Starting mode')).toHaveValue('door');
  await expect(page.getByLabel('Starting speed')).toHaveValue('1.5');
  await outside.click();
  await expect(outside).toBeChecked();
  expect((await draft()).length).toBe(length);
  await page.locator('#sheet-close').click();
  await page.locator('#test-level').click();
  await expect(page.locator('#level-name')).toContainText('DOOR');
});
