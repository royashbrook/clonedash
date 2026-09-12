import { test, expect } from '@playwright/test';

async function trackPaint(page) {
  await page.addInitScript(() => {
    const fill = CanvasRenderingContext2D.prototype.fillRect;
    CanvasRenderingContext2D.prototype.fillRect = function (x, y, w, h) {
      if (['#9aff6b', '#53e3ff'].includes(this.fillStyle) && w === h && w > 20 && w < 60) window.playerPaint = { y: this.getTransform().f, width: w };
      return fill.call(this, x, y, w, h);
    };
  });
}

test('jumper accepts brief midair touches but held and repeated Space do not fly', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 932, height: 430 }, hasTouch: true });
  const page = await context.newPage(); await page.clock.install(); await trackPaint(page);
  await page.addInitScript(() => localStorage.setItem('clonedash.v1', JSON.stringify({ version: 1, sound: false, best: { 0: 100 }, draft: { name: 'Air taps', length: 40, objects: [{ type: 'jumper', x: 3, y: 0, rotation: 0, flipX: false, flipY: false }] } })));
  await page.goto(process.env.GAME_URL || 'http://127.0.0.1:4191');
  await page.locator('#editor-open').click(); await page.locator('#test-level').click();
  await page.clock.runFor(900); await expect(page.locator('#level-name')).toContainText('JUMPER ↓');
  await expect(page.locator('#cue')).toContainText('TAP AGAIN IN MIDAIR');
  const ground = await page.evaluate(() => window.playerPaint.y);
  await page.keyboard.down('Space'); await page.clock.runFor(550);
  const peak = await page.evaluate(() => window.playerPaint.y);
  await page.keyboard.down('Space'); await page.clock.runFor(200);
  const falling = await page.evaluate(() => window.playerPaint.y);
  expect(falling).toBeGreaterThan(peak + 8); expect(falling).toBeLessThan(ground - 20);
  await page.keyboard.up('Space'); await page.touchscreen.tap(700, 200); await page.clock.runFor(200);
  const boosted = await page.evaluate(() => window.playerPaint.y);
  expect(boosted).toBeLessThan(falling - 30);
  await page.clock.runFor(100); await page.touchscreen.tap(700, 200); await page.clock.runFor(100);
  expect(await page.evaluate(() => window.playerPaint.y)).toBeLessThan(boosted - 20);
  await expect(page.locator('#attempt')).toHaveText('TRY 1');
  await context.close();
});

test('outline is transparent with white edges; new editor objects transform and survive reload', async ({ page }) => {
  await page.goto('/'); await page.locator('#editor-open').click();
  const point = await page.evaluate(() => {
    const top = document.querySelector('.editor-head').getBoundingClientRect().bottom;
    const floor = document.querySelector('.editor-controls').getBoundingClientRect().top - 18;
    const unit = Math.max(12, Math.min((floor - top - 14) / 7, innerWidth / 13.5, 82));
    return { floor, unit };
  });
  const pixel = (x, y) => page.locator('#world').evaluate((canvas, p) => {
    const ratio = canvas.width / innerWidth;
    return [...canvas.getContext('2d').getImageData(Math.floor(p.x * ratio), Math.floor(p.y * ratio), 1, 1).data];
  }, { x, y });
  const background = await pixel(5.5 * point.unit, point.floor - .5 * point.unit);
  for (const [tab, name, type, x] of [['BLOCKS', '□ OUTLINE', 'outline', 5], ['SPIKES', '▴ ¼ SIZE', 'quarter', 7], ['PORTALS', '⇈ JUMPER', 'jumper', 9]]) {
    await page.locator('#step-size').selectOption('1');
    await page.getByRole('tab', { name: tab, exact: true }).click();
    await page.getByRole('button', { name, exact: true }).click();
    await page.mouse.click((x + .1) * point.unit, point.floor - .1 * point.unit);
    await expect(page.locator('#selection')).toContainText(type.toUpperCase());
    if (type === 'outline') {
      expect(await pixel(5.5 * point.unit, point.floor - .5 * point.unit)).toEqual(background);
      expect(await pixel(5 * point.unit, point.floor - .5 * point.unit)).toEqual([255, 255, 255, 255]);
    }
    await page.getByRole('button', { name: 'Rotate clockwise', exact: true }).click();
    await page.getByRole('button', { name: 'FLIP ↔', exact: true }).click();
    await page.locator('#step-size').selectOption('0.05');
    await page.getByRole('button', { name: 'Move right', exact: true }).click();
  }
  const draft = await page.evaluate(() => JSON.parse(localStorage.getItem('clonedash.v1')).draft);
  expect(draft.objects.map(o => o.type)).toEqual(['outline', 'quarter', 'jumper']);
  expect(draft.objects.map(o => o.x)).toEqual([5.05, 7.05, 9.05]);
  expect(draft.objects.every(o => o.rotation === 270 && o.flipX)).toBe(true);
  await page.screenshot({ path: 'test-results/jumper-editor.png' });
  await page.reload(); await page.locator('#editor-open').click();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('clonedash.v1')).draft)).toEqual(draft);
});

test('Air Steps lands on the high outline shelf using real air jumps and saves completion', async ({ page }) => {
  await page.clock.install(); await trackPaint(page); await page.goto('/');
  await page.getByRole('button', { name: 'Play Air Steps', exact: true }).click();
  await page.clock.runFor(32);
  const ground = await page.evaluate(() => window.playerPaint);
  const jumps = [5.5, 7.5, 16.5, 26, 40]; let next = 0, shelfSeen = false;
  for (let i = 0; i < 600; i++) {
    if (await page.getByRole('heading', { name: 'Level Complete!' }).isVisible()) break;
    const x = 1 + await page.locator('#run-progress').evaluate(e => e.value) / 100 * 47;
    if (next < jumps.length && x >= jumps[next]) { await page.keyboard.down('Space'); next++; }
    else await page.keyboard.up('Space');
    if (x > 12 && !shelfSeen) {
      await expect(page.locator('#level-name')).toContainText('JUMPER ↓');
      const shelf = await page.evaluate(() => window.playerPaint);
      expect(ground.y - shelf.y).toBeCloseTo(4 * ground.width / .64, 1);
      await page.screenshot({ path: 'test-results/jumper-high-shelf.png' }); shelfSeen = true;
    }
    await page.clock.runFor(20);
  }
  await expect(page.getByRole('heading', { name: 'Level Complete!' })).toBeVisible();
  await expect(page.locator('#attempt')).toHaveText('TRY 1'); expect(next).toBe(jumps.length); expect(shelfSeen).toBe(true);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('clonedash.v1')).best[8])).toBe(100);
  await page.reload(); await expect(page.locator('#notice')).toBeHidden();
  await expect(page.getByRole('button', { name: 'Play Air Steps', exact: true })).toContainText('✓');
});
