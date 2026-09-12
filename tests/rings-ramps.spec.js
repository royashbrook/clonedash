import { test, expect } from '@playwright/test';

test('new tabs place and persist every new object; black blocks and ramps paint the requested edges', async ({ page }) => {
  await page.goto('/'); await page.locator('#editor-open').click();
  const view = await page.evaluate(() => {
    const floor = document.querySelector('.editor-controls').getBoundingClientRect().top - 18;
    const top = document.querySelector('.editor-head').getBoundingClientRect().bottom;
    return { floor, unit: Math.max(12, Math.min((floor - top - 14) / 7, innerWidth / 13.5, 82)) };
  });
  const pixel = (x, y) => page.locator('#world').evaluate((c, p) => {
    const d = c.width / innerWidth;
    return [...c.getContext('2d').getImageData(Math.floor(p.x * d), Math.floor(p.y * d), 1, 1).data];
  }, { x: x * view.unit, y: view.floor - y * view.unit });
  for (const [tab, name, type, x] of [['BLOCKS', '■ NO BORDER', 'plain-black', 5], ['RAMP', '◩ BLACK', 'ramp-black', 8], ['RAMP', '◩ GRID', 'ramp-grid', 11], ['RAMP', '◩ SOLID', 'ramp', 14], ['RINGS', '◉ JUMP RING', 'ring', 17]]) {
    await page.getByRole('tab', { name: tab, exact: true }).click();
    await page.getByRole('button', { name, exact: true }).click();
    await page.mouse.click((x + .1) * view.unit, view.floor - 1.1 * view.unit);
    await expect(page.locator('#selection')).toContainText(type.toUpperCase());
    if (type === 'plain-black') {
      await expect.poll(() => pixel(5.5, 1.5)).toEqual([0, 0, 0, 255]);
      expect((await pixel(5, 1.5))[0]).toBeLessThan(100);
    }
    if (type === 'ramp-black') {
      await expect.poll(() => pixel(8.75, 1.2)).toEqual([0, 0, 0, 255]);
      expect((await pixel(8.5, 1.5))[0]).toBeGreaterThan(220);
      expect((await pixel(9, 1.5))[0]).toBeLessThan(100);
      expect((await pixel(8.75, 1))[0]).toBeLessThan(100);
    }
    await page.getByRole('button', { name: 'Rotate clockwise', exact: true }).click();
    await page.getByRole('button', { name: 'FLIP ↕', exact: true }).click();
  }
  const draft = await page.evaluate(() => JSON.parse(localStorage.getItem('clonedash.v1')).draft);
  expect(draft.objects.map(o => o.type)).toEqual(['plain-black', 'ramp-black', 'ramp-grid', 'ramp', 'ring']);
  expect(draft.objects.every(o => o.rotation === 270 && o.flipY)).toBe(true);
  await page.screenshot({ path: 'test-results/rings-ramps-editor.png' });
  await page.reload(); await page.locator('#editor-open').click();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('clonedash.v1')).draft)).toEqual(draft);
});

test('real ring touch gives square a midair jump; ignoring it does not', async ({ browser }) => {
  for (const activate of [false, true]) {
    const context = await browser.newContext({ viewport: { width: 932, height: 430 }, hasTouch: true });
    const page = await context.newPage(); await page.clock.install();
    await page.addInitScript(() => {
      localStorage.setItem('clonedash.v1', JSON.stringify({ version: 1, best: {}, sound: false, draft: { name: 'Ring touch', length: 20, objects: [{ type: 'ring', x: 8, y: 2, rotation: 0, flipX: false, flipY: false }] } }));
      const fill = CanvasRenderingContext2D.prototype.fillRect;
      CanvasRenderingContext2D.prototype.fillRect = function(x,y,w,h) {
        if (this.fillStyle === '#9aff6b' && w === h && w > 20 && w < 60) window.playerPaint = { y: this.getTransform().f, width: w };
        return fill.call(this,x,y,w,h);
      };
    });
    await page.goto(process.env.GAME_URL || 'http://127.0.0.1:4191');
    await page.locator('#editor-open').click(); await page.locator('#test-level').click(); await page.clock.runFor(32);
    const ground = await page.evaluate(() => window.playerPaint);
    const x = () => page.locator('#run-progress').evaluate(e => 1 + e.value / 100 * 19);
    while (await x() < 5.5) await page.clock.runFor(20);
    await page.keyboard.down('Space'); await page.clock.runFor(20); await page.keyboard.up('Space');
    while (await x() < 7.5) await page.clock.runFor(20);
    if (activate) {
      const current = await x(), unit = ground.width / .64;
      const ringX = (8.5 - Math.max(0, current - 3)) * unit;
      const ringY = ground.y - (2.5 - .32) * unit;
      await page.touchscreen.tap(ringX, ringY);
    }
    await page.clock.runFor(300);
    const height = (ground.y - await page.evaluate(() => window.playerPaint.y)) / (ground.width / .64);
    if (activate) expect(height).toBeGreaterThan(3.7); else expect(height).toBeLessThan(2.3);
    await expect(page.locator('#attempt')).toHaveText('TRY 1');
    await context.close();
  }
});

test('real square walks up and down a 45-degree ramp course without jumping', async ({ page }) => {
  await page.clock.install();
  await page.addInitScript(() => localStorage.setItem('clonedash.v1', JSON.stringify({ version: 1, best: {}, sound: false, draft: { name: 'Ramp walk', length: 20, objects: [{ type: 'ramp-grid', x: 5, y: 0, rotation: 0, flipX: false, flipY: false }, { type: 'plain-black', x: 6, y: 0, rotation: 0, flipX: false, flipY: false }, { type: 'ramp-black', x: 7, y: 0, rotation: 0, flipX: true, flipY: false }] } })));
  await page.goto('/'); await page.locator('#editor-open').click(); await page.locator('#test-level').click();
  await page.clock.runFor(1300); await page.screenshot({ path: 'test-results/ramp-walk.png' });
  await page.clock.runFor(3300); await expect(page.getByRole('heading', { name: 'Level Complete!' })).toBeVisible();
  await expect(page.locator('#attempt')).toHaveText('TRY 1');
});
