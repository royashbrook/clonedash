import { test, expect } from '@playwright/test';

// TRY runs the trail over the editor grid with the palette still up. Space or a canvas tap
// jumps, a death restarts the run, and Esc or STOP drops back to editing where the run was.
test('TRY plays the draft over the editor, restarts on death, jumps on Space, and Esc returns at the spot', async ({ page }) => {
  await page.clock.install();
  await page.addInitScript(() => {
    const piece = (type, x, y = 0) => ({ type, x, y, rotation: 0, flipX: false, flipY: false });
    localStorage.setItem('clonedash.v1', JSON.stringify({ version: 1, best: {}, sound: false, draft: { name: 'Try loop', length: 40, objects: [piece('spike', 6)] } }));
  });
  await page.goto('/'); await page.locator('#editor-open').click();
  await expect(page.locator('#try-level')).toHaveText('▶ TRY');
  await page.locator('#try-level').click();
  await expect(page.locator('#try-level')).toHaveText('■ STOP');
  await expect(page.locator('#selection')).toContainText('TRY 1 · TAP TO JUMP');
  await expect(page.locator('#palette')).toBeVisible(); await expect(page.locator('#hud')).toBeHidden();
  // no input: the spike at 6 kills, the run restarts by itself
  const attempt = () => page.evaluate(() => document.querySelector('#selection').textContent.includes('TRY 2'));
  for (let t = 0; t < 3000 && !(await attempt()); t += 20) await page.clock.runFor(20);
  await expect(page.locator('#selection')).toContainText('TRY 2');
  // a jump at the right moment clears it: 0.4s ready, then five blocks a second, so at 1.0s
  // the square is at x = 4 and the jump carries it over the spike
  await page.clock.runFor(1000);
  await page.keyboard.down('Space'); await page.clock.runFor(120); await page.keyboard.up('Space');
  await page.clock.runFor(1500);
  await expect(page.locator('#selection')).toContainText('TRY 2');
  await expect(page.locator('#selection')).not.toContainText('TRY 3');
  // Esc drops back to editing, scrolled to where the run was
  await page.keyboard.press('Escape');
  await expect(page.locator('#try-level')).toHaveText('▶ TRY');
  await expect(page.locator('#selection')).toContainText('Tap the grid');
  expect(Number(await page.locator('#pan').inputValue())).toBeGreaterThan(4);
  // the draft is untouched and the editor still edits
  expect((await page.evaluate(() => JSON.parse(localStorage.getItem('clonedash.v1')))).draft.objects).toHaveLength(1);
  await page.locator('#pan').evaluate(e => { e.value = '0'; e.dispatchEvent(new Event('input', { bubbles: true })); });
  const point = await page.evaluate(() => {
    const top = document.querySelector('.editor-head').getBoundingClientRect().bottom;
    const floor = document.querySelector('.editor-controls').getBoundingClientRect().top - 18;
    const unit = Math.max(12, Math.min((floor - top - 14) / 7, innerWidth / 13.5, 82));
    return { unit, floor };
  });
  await page.mouse.click(9.1 * point.unit, point.floor - .5 * point.unit);
  await expect(page.locator('#selection')).toContainText('BLOCK · x 9.00');
  // STOP works from the button too, and TEST still gives the full-screen run
  await page.locator('#try-level').click(); await expect(page.locator('#try-level')).toHaveText('■ STOP');
  await page.locator('#try-level').click(); await expect(page.locator('#try-level')).toHaveText('▶ TRY');
  await page.locator('#test-level').click(); await expect(page.locator('#hud')).toBeVisible();
});
