import { test, expect } from '@playwright/test';

test('return and pause stay reachable with a maximum-length title on a narrow landscape screen', async ({ page }) => {
  await page.setViewportSize({ width: 640, height: 360 }); await page.goto('/');
  await page.locator('#editor-open').click(); await page.locator('#level-title').fill('W'.repeat(40)); await page.locator('#level-title').blur();
  await page.locator('#test-level').click();
  for (const id of ['menu', 'pause']) {
    const button = page.locator(`#${id}`), r = await button.boundingBox();
    expect(r.x).toBeGreaterThanOrEqual(0); expect(r.x + r.width).toBeLessThanOrEqual(640); expect(r.height).toBeGreaterThanOrEqual(44);
    expect(await button.evaluate(e => { const r = e.getBoundingClientRect(); return document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2) === e; })).toBe(true);
  }
  await page.locator('#menu').click(); await expect(page.locator('#library')).toBeVisible();
});

test('custom test returns to My Levels from HUD, pause, completion and portrait without changing saves', async ({ page }) => {
  await page.clock.install();
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto('/'); await page.locator('#my-levels').click(); await page.locator('#new-level').click();
  await page.locator('#level-title').fill('Return trip'); await page.locator('#level-title').blur();
  await page.locator('#level-length').fill('20'); await page.locator('#level-length').blur();
  const saved = await page.evaluate(() => localStorage.getItem('clonedash.v1'));
  await page.locator('#test-level').click(); await page.clock.runFor(700);
  const back = page.getByRole('button', { name: 'Return to My Levels', exact: true });
  await expect(back).toHaveText('← MY LEVELS');
  const box = await back.boundingBox(); expect(box.height).toBeGreaterThanOrEqual(44);
  expect(await back.evaluate(e => { const r = e.getBoundingClientRect(); return document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2) === e && e.scrollWidth <= e.clientWidth; })).toBe(true);
  await page.screenshot({ path: `test-results/test-return-${test.info().project.name}.png` });
  await back.click(); await expect(page.locator('#library')).toBeVisible(); await expect(page.locator('#hud')).toBeHidden();
  await page.clock.runFor(5000); await expect(page.locator('#sheet')).not.toBeVisible();
  for (const exit of ['pause', 'complete', 'portrait']) {
    await page.getByRole('button', { name: 'Play Return trip', exact: true }).click();
    if (exit === 'pause') {
      await page.locator('#pause').click(); await expect(page.getByRole('button', { name: 'BACK TO EDITOR', exact: true })).toBeVisible();
      await page.locator('#sheet').getByRole('button', { name: 'MY LEVELS', exact: true }).click();
    } else if (exit === 'complete') {
      await page.clock.runFor(4700); await expect(page.getByRole('heading', { name: 'Level Complete!' })).toBeVisible();
      await page.locator('#sheet').getByRole('button', { name: 'MY LEVELS', exact: true }).click();
    } else {
      await page.setViewportSize({ width: 430, height: 932 });
      await expect(page.locator('#rotate')).toBeVisible(); await expect(page.locator('#rotate-menu')).toHaveText('MY LEVELS');
      await page.locator('#rotate-menu').click(); await expect(page.locator('#rotate')).toBeHidden();
    }
    await expect(page.locator('#library')).toBeVisible(); await expect(page.locator('.custom-card')).toHaveCount(2);
    expect(await page.evaluate(() => localStorage.getItem('clonedash.v1'))).toBe(saved);
  }
  await page.setViewportSize({ width: 932, height: 430 });
  await page.getByRole('button', { name: 'Edit Return trip', exact: true }).click();
  await expect(page.locator('#level-title')).toHaveValue('Return trip'); await expect(page.locator('#level-length')).toHaveValue('20');
  await page.locator('#editor-back').click(); await page.locator('#library-back').click();
  await page.getByRole('button', { name: 'Play First Spark', exact: true }).click();
  await expect(back).toHaveCount(0); await expect(page.locator('#menu')).toHaveText('☰');
  await page.locator('#menu').click(); await expect(page.getByRole('heading', { name: 'Paused' })).toBeVisible();
  await expect(page.locator('#sheet').getByRole('button', { name: 'MY LEVELS', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'RESUME', exact: true }).click();
  await page.setViewportSize({ width: 430, height: 932 }); await expect(page.locator('#rotate-menu')).toHaveText('MAIN MENU');
  expect(errors).toEqual([]);
});
