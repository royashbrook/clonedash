import { test, expect } from '@playwright/test';

// Coins, group ids, move and colour triggers, and the Cube Dash name (#16).
const stored = page => page.evaluate(() => JSON.parse(localStorage.getItem('clonedash.v1')));
const piece = (type, x, y = 0, extra = {}) => ({ type, x, y, rotation: 0, flipX: false, flipY: false, ...extra });
const seed = (page, objects, length = 40) => page.addInitScript(([objects, length]) => {
  if (!localStorage.getItem('clonedash.v1')) localStorage.setItem('clonedash.v1', JSON.stringify({ version: 1, best: {}, sound: false, draft: { name: 'Cube test', length, objects } }));
  // where the player is painted: its square's fill, as in rings-ramps.spec.js
  const fill = CanvasRenderingContext2D.prototype.fillRect;
  CanvasRenderingContext2D.prototype.fillRect = function (x, y, w, h) {
    if (this.fillStyle === '#9aff6b' && w === h && w > 20 && w < 60) window.playerPaint = { y: this.getTransform().f, width: w };
    return fill.call(this, x, y, w, h);
  };
}, [objects, length]);
const grid = async page => {
  const point = await page.evaluate(() => {
    const top = document.querySelector('.editor-head').getBoundingClientRect().bottom;
    const floor = document.querySelector('.editor-controls').getBoundingClientRect().top - 18;
    return { unit: Math.max(12, Math.min((floor - top - 14) / 7, innerWidth / 13.5, 82)), floor };
  });
  return (x, y) => page.mouse.click((x + .1) * point.unit, point.floor - (y + .5) * point.unit);
};
// The run's x from the progress bar, and the colour painted at a level point in play (camera x - 3).
const runX = (page, length) => page.locator('#run-progress').evaluate((e, length) => 1 + e.value / 100 * (length - 1), length);
async function pixel(page, length, x, y) {
  const ground = await page.evaluate(() => window.playerPaint);
  const unit = ground.width / .64, camera = Math.max(0, await runX(page, length) - 3);
  // the player is painted with its feet on y 0, its middle half an avatar (one block) up
  return page.evaluate(([px, py]) => {
    const canvas = document.querySelector('#world'), scale = canvas.width / innerWidth;
    let best = [0, 0, 0];
    const data = canvas.getContext('2d').getImageData(Math.round(px * scale) - 1, Math.round(py * scale) - 1, 3, 3).data;
    for (let i = 0; i < data.length; i += 4) if (data[i] + data[i + 1] + data[i + 2] > best[0] + best[1] + best[2]) best = [data[i], data[i + 1], data[i + 2]];
    return best;
  }, [(x - camera) * unit, ground.y - (y - .5) * unit]);
}
const runTo = async (page, length, x) => { for (let i = 0; i < 400 && await runX(page, length) < x; i++) await page.clock.runFor(20); };
const white = ([r, g, b]) => r > 200 && g > 200 && b > 200;

test('the visible name is Cube Dash: title, header, about, install name', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle('Cube Dash');
  await expect(page.locator('.brand')).toHaveText('CUBE DASH');
  await expect(page.getByRole('link', { name: 'Cube Dash home' })).toBeVisible();
  const manifest = await page.evaluate(() => fetch('/manifest.json').then(r => r.json()));
  expect([manifest.name, manifest.short_name, manifest.id]).toEqual(['Cube Dash', 'Cube Dash', '/']);
  await page.locator('#about').click();
  await expect(page.locator('#sheet-title')).toHaveText('Cube Dash');
  // the one Clone Dash left on screen is the seventh warmup trail's own name, kept with its save index
  await page.locator('#sheet-close').click();
  await expect(page.locator('#home')).toContainText('Clone Dash');
  await expect(page.locator('.level-card', { hasText: 'Clone Dash' })).toHaveCount(1);
});

test('a coin places from COINS, is picked up in a run, shows in the HUD and keeps a best', async ({ page }) => {
  await page.clock.install();
  await seed(page, []);
  await page.goto('/'); await page.locator('#editor-open').click();
  const cell = await grid(page);
  await page.getByRole('tab', { name: 'COINS', exact: true }).click();
  await page.getByRole('button', { name: '● COIN', exact: true }).click();
  await cell(6, 0);
  expect((await stored(page)).draft.objects).toEqual([piece('coin', 6, 0)]);
  await page.locator('#test-level').click();
  await page.clock.runFor(500);
  await expect(page.locator('#coins')).toBeVisible();
  await expect(page.locator('#coins')).toHaveText('0 / 1');
  await runTo(page, 40, 8);
  await expect(page.locator('#coins')).toHaveText('1 / 1');
  await page.clock.runFor(7000);
  await expect(page.getByRole('heading', { name: 'Level Complete!' })).toBeVisible();
  await expect(page.locator('#sheet')).toContainText('Coins: 1 / 1.');
  await expect(page.locator('#attempt')).toHaveText('TRY 1');
  expect((await stored(page)).customLevels[0].coins).toBe(1);
  await page.getByRole('button', { name: 'MY LEVELS', exact: true }).click();
  await expect(page.locator('.custom-card').first()).toContainText('best 1 / 1 coins');
});

test('the eleventh coin is refused with a message and not placed', async ({ page }) => {
  await seed(page, Array.from({ length: 10 }, (_, i) => piece('coin', 4 + i * 2, 3)));
  await page.goto('/'); await page.locator('#editor-open').click();
  const cell = await grid(page);
  await page.getByRole('tab', { name: 'COINS', exact: true }).click();
  await cell(5, 0);
  await expect(page.locator('#notice')).toContainText('10 coins');
  expect((await stored(page)).draft.objects.filter(o => o.type === 'coin')).toHaveLength(10);
  expect((await stored(page)).draft.objects).toHaveLength(10);
});

test('the TRIGGERS tab places a move and a colour trigger, and EDIT OBJECT sets their fields', async ({ page }) => {
  await page.goto('/'); await page.locator('#editor-open').click();
  const cell = await grid(page);
  await page.getByRole('tab', { name: 'TRIGGERS', exact: true }).click();
  await expect(page.locator('#palette button')).toHaveText(['⇄ MOVE', '◐ COLOR']);
  await page.getByRole('button', { name: '⇄ MOVE', exact: true }).click();
  await cell(5, 0);
  await page.getByRole('button', { name: '◐ COLOR', exact: true }).click();
  await cell(7, 0);
  expect((await stored(page)).draft.objects).toEqual([
    piece('move-trigger', 5, 0, { target: 1, moveY: 2, duration: 1 }),
    piece('color-trigger', 7, 0, { target: 1, color: '#ff5c7a', duration: 1 }),
  ]);
  await expect(page.locator('#selection')).toContainText('COLOR TRIGGER');
  await page.screenshot({ path: 'test-results/triggers-tab.png' });
  await page.locator('#edit-object').click();
  const sheet = page.locator('dialog');
  await expect(sheet.locator('#trigger-color')).toBeVisible();
  await expect(sheet.locator('#group-id')).toHaveCount(0); // a trigger has no group of its own
  await sheet.locator('#trigger-color').selectOption('#53e3ff');
  await sheet.locator('#trigger-target').fill('4'); await sheet.locator('#trigger-target').dispatchEvent('change');
  await sheet.getByRole('button', { name: 'DONE' }).click();
  await page.locator('#select-tool').click();
  await cell(5, 0);
  await page.locator('#edit-object').click();
  await sheet.locator('#trigger-move-x').fill('-2'); await sheet.locator('#trigger-move-x').dispatchEvent('change');
  await sheet.locator('#trigger-time').fill('0'); await sheet.locator('#trigger-time').dispatchEvent('change');
  await sheet.locator('#trigger-move-y').fill('99'); await sheet.locator('#trigger-move-y').dispatchEvent('change');
  await expect(page.locator('#notice')).toContainText('whole blocks');
  await sheet.getByRole('button', { name: 'DONE' }).click();
  expect((await stored(page)).draft.objects).toEqual([
    piece('move-trigger', 5, 0, { target: 1, moveY: 2, moveX: -2 }),
    piece('color-trigger', 7, 0, { target: 4, color: '#53e3ff', duration: 1 }),
  ]);
  await expect(page.locator('#selection')).toContainText('MOVE -2, 2 · INSTANT');
});

test('EDIT OBJECT gives a piece a group id, and blank takes it away', async ({ page }) => {
  await page.goto('/'); await page.locator('#editor-open').click();
  const cell = await grid(page);
  await cell(5, 0);
  await page.locator('#edit-object').click();
  const sheet = page.locator('dialog');
  await expect(sheet).toContainText('GROUP ID');
  await sheet.locator('#group-id').fill('3'); await sheet.locator('#group-id').dispatchEvent('change');
  expect((await stored(page)).draft.objects[0]).toEqual(piece('block', 5, 0, { group: 3 }));
  await sheet.locator('#group-id').fill('100'); await sheet.locator('#group-id').dispatchEvent('change');
  await expect(page.locator('#notice')).toContainText('1 to 99');
  expect((await stored(page)).draft.objects[0].group).toBe(3);
  await sheet.getByRole('button', { name: 'DONE' }).click();
  await expect(page.locator('#selection')).toContainText('GROUP 3');
  await page.locator('#edit-object').click();
  await sheet.locator('#group-id').fill(''); await sheet.locator('#group-id').dispatchEvent('change');
  expect('group' in (await stored(page)).draft.objects[0]).toBe(false);
});

test('a move trigger visibly lifts a grouped block out of the path during a run', async ({ page }) => {
  await page.clock.install();
  await seed(page, [piece('block', 14, 0, { group: 1 }), piece('move-trigger', 5, 0, { target: 1, moveY: 3, duration: 1 })]);
  await page.goto('/'); await page.locator('#editor-open').click(); await page.locator('#test-level').click();
  await page.clock.runFor(500);
  await runTo(page, 40, 3.5);
  // before the trigger: the block's top edge (white) sits one block up, nothing at four blocks up
  expect(white(await pixel(page, 40, 14.5, 1))).toBe(true);
  expect(white(await pixel(page, 40, 14.5, 4))).toBe(false);
  await runTo(page, 40, 11);
  expect(white(await pixel(page, 40, 14.5, 4))).toBe(true);
  expect(white(await pixel(page, 40, 14.5, 1))).toBe(false);
  await page.screenshot({ path: 'test-results/move-trigger.png' });
  await page.clock.runFor(7000);
  await expect(page.getByRole('heading', { name: 'Level Complete!' })).toBeVisible();
  await expect(page.locator('#attempt')).toHaveText('TRY 1'); // the block it would have hit had moved
  expect((await stored(page)).draft.objects[0]).toEqual(piece('block', 14, 0, { group: 1 })); // the saved level never moved
});

test('phone landscape: the coin count fits the run HUD and the trigger fields fit EDIT OBJECT', async ({ page }) => {
  await page.setViewportSize({ width: 667, height: 375 });
  await page.clock.install();
  await seed(page, [piece('coin', 6, 3), piece('move-trigger', 8, 0, { target: 1, moveY: 2, duration: 1 })]);
  await page.goto('/'); await page.locator('#editor-open').click();
  await page.locator('#select-tool').click();
  const cell = await grid(page);
  await cell(8, 0);
  await page.locator('#edit-object').click();
  const fits = () => page.evaluate(() => {
    const d = document.querySelector('dialog'), box = d.getBoundingClientRect();
    return d.scrollWidth <= d.clientWidth && box.left >= 0 && box.right <= innerWidth && [...d.querySelectorAll('input, select')].every(e => e.getBoundingClientRect().height >= 44);
  });
  expect(await fits()).toBe(true);
  // the sheet scrolls on a short screen; every field can be brought fully into view
  for (const id of ['#trigger-target', '#trigger-move-x', '#trigger-move-y', '#trigger-time']) {
    await page.locator(id).scrollIntoViewIfNeeded();
    await expect(page.locator(id)).toBeInViewport({ ratio: 1 });
  }
  await page.screenshot({ path: 'test-results/edit-trigger-phone.png' });
  await page.getByRole('button', { name: 'DONE' }).click();
  await page.locator('#test-level').click();
  await page.clock.runFor(600);
  const hud = await page.evaluate(() => [...document.querySelectorAll('#hud > *')].filter(e => !e.hidden).map(e => { const r = e.getBoundingClientRect(); return [e.id || e.className, r.left, r.right]; }));
  expect(hud.map(([id]) => id)).toEqual(['menu', 'run-label', 'coins', 'attempt', 'pause']);
  for (let i = 1; i < hud.length; i++) expect(hud[i][1]).toBeGreaterThanOrEqual(hud[i - 1][2]);
  expect(hud.at(-1)[2]).toBeLessThanOrEqual(667);
});

test('a colour trigger recolours only its group during a run', async ({ page }) => {
  await page.clock.install();
  await seed(page, [piece('block', 14, 2, { group: 2 }), piece('block', 16, 2, { group: 3 }), piece('color-trigger', 5, 0, { target: 2, color: '#ff5c7a' })]);
  await page.goto('/'); await page.locator('#editor-open').click(); await page.locator('#test-level').click();
  await page.clock.runFor(500);
  await runTo(page, 40, 3.5);
  const [r0] = await pixel(page, 40, 14.5, 2.5);
  expect(r0).toBeLessThan(120);
  await runTo(page, 40, 8);
  const [r, g, b] = await pixel(page, 40, 14.5, 2.5);
  expect([r > 230, g > 70 && g < 115, b > 100 && b < 145]).toEqual([true, true, true]);
  const [r2] = await pixel(page, 40, 16.5, 2.5);
  expect(r2).toBeLessThan(120); // group 3 keeps its own look
  await page.screenshot({ path: 'test-results/color-trigger.png' });
});
