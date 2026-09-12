import { test, expect } from '@playwright/test';

test('wheel rejects midair taps and held landing flips, accepts fresh surface taps, and resets on retry', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 932, height: 430 }, hasTouch: true });
  const page = await context.newPage();
  await page.clock.install();
  await page.addInitScript(() => localStorage.setItem('clonedash.v1', JSON.stringify({ version: 1, sound: false, best: { 0: 100 }, draft: { name: 'Wheel taps', length: 40, objects: [{ type: 'wheel', x: 3, y: 0, rotation: 0, flipX: false, flipY: false }] } })));
  await page.goto(process.env.GAME_URL || 'http://127.0.0.1:4191');
  await expect(page.locator('#notice')).toBeHidden();
  await page.locator('#editor-open').click(); await page.locator('#test-level').click();
  await page.clock.runFor(900); await expect(page.locator('#level-name')).toContainText('WHEEL ↓');
  await expect(page.locator('#cue')).toContainText('TAP TO FLIP GRAVITY');
  await page.touchscreen.tap(700, 200); await page.clock.runFor(100);
  await expect(page.locator('#level-name')).toContainText('WHEEL ↑');
  await page.clock.runFor(200); await expect(page.locator('#level-name')).toContainText('WHEEL ↑');
  await page.touchscreen.tap(700, 200); await page.clock.runFor(80);
  await expect(page.locator('#level-name')).toContainText('WHEEL ↑');
  await page.keyboard.down('Space'); await page.clock.runFor(80);
  await expect(page.locator('#level-name')).toContainText('WHEEL ↑');
  await page.clock.runFor(1000);
  await expect(page.locator('#level-name')).toContainText('WHEEL ↑');
  await page.keyboard.down('Space'); await page.clock.runFor(80);
  await expect(page.locator('#level-name')).toContainText('WHEEL ↑');
  await page.keyboard.up('Space'); await page.keyboard.down('Space'); await page.clock.runFor(80);
  await expect(page.locator('#level-name')).toContainText('WHEEL ↓'); await page.keyboard.up('Space');
  await page.clock.runFor(1100);
  await page.touchscreen.tap(700, 200); await page.clock.runFor(80);
  await expect(page.locator('#level-name')).toContainText('WHEEL ↑'); await page.keyboard.up('Space');
  await page.locator('#pause').click();
  await page.getByRole('button', { name: 'RESTART LEVEL', exact: true }).click(); await page.clock.runFor(900);
  await expect(page.locator('#level-name')).toContainText('WHEEL ↓');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('clonedash.v1')).best[0])).toBe(100);
  await context.close();
});

test('new editor objects place, transform, persist and black blocks paint black', async ({ page }) => {
  await page.goto('/'); await page.locator('#editor-open').click();
  const placed = [];
  for (const [tab, name, type, x] of [['BLOCKS', '■ BLACK', 'black', 5], ['SPIKES', '▴ ⅔ SIZE', 'small', 7], ['PORTALS', '⊙ WHEEL', 'wheel', 9], ['GRAVITY', '↑ UPSIDE DOWN', 'gravity-up', 11], ['GRAVITY', '↓ NORMAL', 'gravity-down', 13]]) {
    await page.getByRole('tab', { name: tab, exact: true }).click();
    await page.getByRole('button', { name, exact: true }).click();
    const point = await page.evaluate(x => {
      const top = document.querySelector('.editor-head').getBoundingClientRect().bottom;
      const floor = document.querySelector('.editor-controls').getBoundingClientRect().top - 18;
      const unit = Math.max(12, Math.min((floor - top - 14) / 7, innerWidth / 13.5, 82));
      return { x: (x + .1) * unit, y: floor - .1 * unit, unit, floor };
    }, x);
    await page.mouse.click(point.x, point.y);
    await expect(page.locator('#selection')).toContainText(type.toUpperCase());
    if (type === 'black') {
      const pixel = await page.locator('#world').evaluate((canvas, p) => {
        const ratio = canvas.width / innerWidth;
        return [...canvas.getContext('2d').getImageData(Math.round((5.5 * p.unit) * ratio), Math.round((p.floor - .5 * p.unit) * ratio), 1, 1).data];
      }, point);
      expect(pixel).toEqual([0, 0, 0, 255]);
    }
    await page.getByRole('button', { name: 'Rotate clockwise', exact: true }).click();
    await page.getByRole('button', { name: 'FLIP ↕', exact: true }).click();
    placed.push(type);
  }
  const draft = await page.evaluate(() => JSON.parse(localStorage.getItem('clonedash.v1')).draft);
  expect(draft.objects.map(o => o.type)).toEqual(placed);
  expect(draft.objects.every(o => o.rotation === 270 && o.flipY)).toBe(true);
  await page.screenshot({ path: 'test-results/gravity-editor.png' });
  await page.reload(); await page.locator('#editor-open').click();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('clonedash.v1')).draft)).toEqual(draft);
});

test('bonus trail uses real wheel taps, both gravity directions, and finishes without a death', async ({ page }) => {
  await page.clock.install(); await page.goto('/');
  await page.getByRole('button', { name: 'Play Gravity Flip', exact: true }).click();
  let flipped = false, jumped = false, ceilingSeen = false;
  for (let i = 0; i < 650; i++) {
    if (await page.getByRole('heading', { name: 'Level Complete!' }).isVisible()) break;
    const x = 1 + await page.locator('#run-progress').evaluate(e => e.value) / 100 * 51;
    if (x > 12 && !ceilingSeen) {
      await expect(page.locator('#level-name')).toContainText('WHEEL ↑');
      await page.screenshot({ path: 'test-results/wheel-ceiling.png' }); ceilingSeen = true;
    }
    if (x > 26 && !flipped) { await expect(page.locator('#level-name')).toContainText('WHEEL ↓'); await page.keyboard.down('Space'); flipped = true; }
    else if (x > 41.9 && !jumped) { await expect(page.locator('#level-name')).toContainText('SQUARE ↓'); await page.keyboard.down('Space'); jumped = true; }
    else await page.keyboard.up('Space');
    await page.clock.runFor(20);
  }
  await expect(page.getByRole('heading', { name: 'Level Complete!' })).toBeVisible();
  await expect(page.locator('#attempt')).toHaveText('TRY 1'); expect(flipped && jumped && ceilingSeen).toBe(true);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('clonedash.v1')).best[7])).toBe(100);
  await page.reload(); await expect(page.locator('#notice')).toBeHidden();
  await expect(page.getByRole('button', { name: 'Play Gravity Flip', exact: true })).toContainText('✓');
});
