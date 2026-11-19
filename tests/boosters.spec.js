import { test, expect } from "./quiet.mjs";

// #106 from the player's side, docs/ramps-and-boosters.md: the angle crashes on a block, boosters,
// the black and gray rings, a size for every body, and SWIPE with its undo. Drags here are real
// pointer input (page.mouse, and CDP touch in Chromium), not synthetic events, except where noted.
const stored = page => page.evaluate(() => JSON.parse(localStorage.getItem('clonedash.v1')));
const piece = (type, x, y = 0, extra = {}) => ({ type, x, y, rotation: 0, flipX: false, flipY: false, ...extra });
const seed = (page, objects, length = 40) => page.addInitScript(([objects, length]) => {
  if (!localStorage.getItem('clonedash.v1')) localStorage.setItem('clonedash.v1', JSON.stringify({ version: 1, best: {}, sound: false, draft: { name: 'Boost test', length, objects } }));
  document.addEventListener('pointerdown', (e) => (window.lastPointer = e.pointerId), true);
}, [objects, length]);
// a cell's point on the editor grid (the view starts at 0): x rounds to a cell, y rounds down
const grid = async page => {
  const point = await page.evaluate(() => {
    const top = document.querySelector('.editor-head').getBoundingClientRect().bottom;
    const floor = document.querySelector('.editor-controls').getBoundingClientRect().top - 18;
    return { unit: Math.max(12, Math.min((floor - top - 14) / 7, innerWidth / 13.5, 82)), floor };
  });
  return (x, y) => [(x + .1) * point.unit, point.floor - (y + .5) * point.unit];
};
const cells = async (page, filter = () => true) => (await stored(page)).draft.objects.filter(filter).map(o => [o.type, o.x, o.y]);
const openEditor = async page => { await page.goto('/'); await page.locator('#editor-open').click(); };

for (const [label, extra, crashes] of [['crashes landing on a block', {}, true], ['passes through a NO TOUCH one', { noTouch: true }, false]])
  test(`the angle ${label}`, async ({ page }) => {
    await page.clock.install();
    await seed(page, [piece('angle', 3), ...Array.from({ length: 17 }, (_, i) => piece('block', 14 + i, 1, extra))]);
    await openEditor(page);
    await page.locator('#test-level').click();
    // climb to the ceiling, then dive at 45 degrees onto the platform's top
    await page.keyboard.down('Space'); await page.clock.runFor(2400);
    await page.keyboard.up('Space'); await page.clock.runFor(2400);
    if (crashes) await expect(page.locator('#attempt')).not.toHaveText('TRY 1');
    else {
      await page.clock.runFor(6000);
      await expect(page.getByRole('heading', { name: 'Level Complete!' })).toBeVisible();
      await expect(page.locator('#attempt')).toHaveText('TRY 1');
    }
  });

for (const [label, objects, survives] of [
  ['bounces the run over spikes with no tap', [piece('yellow-pad', 7), piece('spike', 9), piece('spike', 10)], true],
  ['is what clears them: without it the run crashes', [piece('spike', 9), piece('spike', 10)], false],
])
  test(`a booster ${label}`, async ({ page }) => {
    await page.clock.install();
    await seed(page, objects, 30);
    await openEditor(page);
    await page.locator('#test-level').click();
    await page.clock.runFor(4000);
    if (survives) {
      await page.clock.runFor(4000);
      await expect(page.getByRole('heading', { name: 'Level Complete!' })).toBeVisible();
      await expect(page.locator('#attempt')).toHaveText('TRY 1');
    } else await expect(page.locator('#attempt')).not.toHaveText('TRY 1');
  });

test('the BOOSTERS tab places all seven, the RINGS tab the black and gray rings, and Size works on any body but a trigger', async ({ page }) => {
  await seed(page, [piece('move-trigger', 16, 1, { target: 1, moveY: 2, duration: 1 })]);
  await openEditor(page);
  const at = await grid(page);
  await page.getByRole('tab', { name: 'BOOSTERS', exact: true }).click();
  const names = ['▬ YELLOW · JUMP', '▬ PINK · SMALL', '▬ RED · BIG', '▬ BLUE · GRAVITY', '▬ GREEN · GRAVITY + BOUNCE', '▬ BLACK · DROP', '▬ GRAY · STOP'];
  await expect(page.locator('#palette button')).toHaveText(names);
  for (const [i, name] of names.entries()) {
    await page.getByRole('button', { name, exact: true }).click();
    await page.mouse.click(...at(4 + i, 0));
  }
  await page.getByRole('tab', { name: 'RINGS', exact: true }).click();
  await page.getByRole('button', { name: '◉ BLACK · DROP', exact: true }).click();
  await page.mouse.click(...at(12, 2));
  await expect(page.locator('#selection')).toContainText('BLACK RING');
  await expect(page.locator('#selection')).toContainText('↓ DROP');
  await page.getByRole('button', { name: '◉ GRAY · STOP', exact: true }).click();
  await page.mouse.click(...at(14, 2));
  await expect(page.locator('#selection')).toContainText('− STOP');
  await expect(page.locator('#bounce')).toBeDisabled();
  const objects = (await stored(page)).draft.objects;
  expect(objects.slice(1, 8).map(o => o.type)).toEqual(['yellow-pad', 'pink-pad', 'red-pad', 'blue-pad', 'green-pad', 'black-pad', 'gray-pad']);
  expect(objects.slice(8)).toEqual([piece('drop-ring', 12, 2, { color: '#000000' }), piece('stop-ring', 14, 2, { color: '#9a9a9a' })]);
  // the selected gray ring takes a size
  await expect(page.locator('#scale-x')).toBeEnabled();
  await page.locator('#scale-x').fill('2');
  await expect.poll(async () => (await stored(page)).draft.objects[9]).toMatchObject({ scaleX: 2, scaleY: 1 });
  await expect(page.locator('#angle')).toBeDisabled();
  // a booster does too (picked by its strip, the shape it fires from), a trigger never
  await page.locator('#select-tool').click();
  await page.mouse.click(...at(6, -0.35));
  await expect(page.locator('#selection')).toContainText('RED BOOSTER');
  await expect(page.locator('#scale-x')).toBeEnabled();
  await expect(page.locator('#scale-y')).toBeEnabled();
  await page.mouse.click(...at(16, 1));
  await expect(page.locator('#selection')).toContainText('MOVE TRIGGER');
  await expect(page.locator('#scale-x')).toBeDisabled();
  await expect(page.locator('#scale-y')).toBeDisabled();
});

test('SWIPE off: a drag with a piece places one piece where it starts, and does not scroll', async ({ page }) => {
  await seed(page, []);
  await openEditor(page);
  const at = await grid(page);
  await expect(page.locator('#swipe-tool')).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('#undo')).toHaveCount(0);
  await page.mouse.move(...at(4, 0)); await page.mouse.down();
  await page.mouse.move(...at(12, 0)); await page.mouse.up();
  expect(await cells(page)).toEqual([['block', 4, 0]]);
  await expect(page.locator('#pan')).toHaveValue('0');
});

test('SWIPE on: a fast native drag paints every cell on its path, saves once, and going back over it changes nothing', async ({ page }) => {
  await seed(page, []);
  await openEditor(page);
  const at = await grid(page);
  await page.locator('#swipe-tool').click();
  await expect(page.locator('#swipe-tool')).toHaveAttribute('aria-pressed', 'true');
  // one jump from the first cell to the last: a single pointermove
  await page.mouse.move(...at(4, 0)); await page.mouse.down();
  await page.mouse.move(...at(12, 0));
  expect(await cells(page), 'nothing saved mid-stroke').toEqual([]);
  await page.mouse.up();
  expect(await cells(page)).toEqual(Array.from({ length: 9 }, (_, i) => ['block', 4 + i, 0]));
  // a fast diagonal: every cell on the way, each next to the last
  await page.mouse.move(...at(4, 1)); await page.mouse.down(); await page.mouse.move(...at(9, 5)); await page.mouse.up();
  const diagonal = (await cells(page)).slice(9).map(([, x, y]) => [x, y]);
  expect(diagonal[0]).toEqual([4, 1]); expect(diagonal.at(-1)).toEqual([9, 5]);
  expect(diagonal).toHaveLength(10);
  for (let k = 1; k < diagonal.length; k++) expect(Math.abs(diagonal[k][0] - diagonal[k - 1][0]) + Math.abs(diagonal[k][1] - diagonal[k - 1][1])).toBe(1);
  // back over the row, both ways: no doubles, nothing removed, no new undo step
  await page.mouse.move(...at(12, 0)); await page.mouse.down(); await page.mouse.move(...at(4, 0)); await page.mouse.move(...at(12, 0)); await page.mouse.up();
  expect(await cells(page)).toHaveLength(19);
  await page.locator('#undo').click();
  expect(await cells(page)).toHaveLength(9);
});

test('SWIPE erase keeps the selection it started with: undo brings it back, and a stroke that erases nothing leaves it alone', async ({ page }) => {
  await seed(page, [piece('spike', 20, 0), piece('block', 5, 0)]);
  await openEditor(page);
  const at = await grid(page);
  await page.locator('#select-tool').click();
  await page.mouse.click(...at(20, 0));
  await expect(page.locator('#selection')).toContainText('SPIKE');
  await page.locator('#swipe-tool').click();
  await page.locator('#erase-tool').click();
  // a stroke over empty cells changes nothing: no undo step, the spike still selected
  await page.mouse.move(...at(9, 3)); await page.mouse.down(); await page.mouse.move(...at(11, 3)); await page.mouse.up();
  await expect(page.locator('#undo')).toBeDisabled();
  await expect(page.locator('#selection')).toContainText('SPIKE');
  // a stroke that erases the block, then undo: the block and the spike's selection come back
  await page.mouse.move(...at(4.6, 0)); await page.mouse.down(); await page.mouse.move(...at(5.4, 0)); await page.mouse.up();
  expect(await cells(page)).toEqual([['spike', 20, 0]]);
  await page.locator('#undo').click();
  expect(await cells(page)).toEqual([['spike', 20, 0], ['block', 5, 0]]);
  await expect(page.locator('#selection')).toContainText('SPIKE', { message: 'the selection from before the erase' });
});

test('SWIPE undo and redo: one step per stroke, the selection comes back, a new stroke drops the redo, another edit clears it', async ({ page }) => {
  await seed(page, [piece('spike', 20, 0)]);
  await openEditor(page);
  const at = await grid(page);
  await page.locator('#select-tool').click();
  await page.mouse.click(...at(20, 0));
  await expect(page.locator('#selection')).toContainText('SPIKE');
  await page.getByRole('tab', { name: 'BLOCKS', exact: true }).click();
  await page.locator('#swipe-tool').click();
  await expect(page.locator('#undo')).toBeDisabled();
  await page.mouse.move(...at(4, 0)); await page.mouse.down(); await page.mouse.move(...at(7, 0)); await page.mouse.up();
  await expect(page.locator('#selection')).toContainText('BLOCK · x 7.00');
  await page.mouse.move(...at(4, 2)); await page.mouse.down(); await page.mouse.move(...at(5, 2)); await page.mouse.up();
  expect(await cells(page)).toHaveLength(7);
  await page.locator('#undo').click();
  expect(await cells(page)).toHaveLength(5);
  await expect(page.locator('#selection')).toContainText('BLOCK · x 7.00');
  await page.locator('#undo').click();
  expect(await cells(page)).toEqual([['spike', 20, 0]]);
  await expect(page.locator('#selection')).toContainText('SPIKE', { message: 'the selection from before the stroke' });
  await expect(page.locator('#undo')).toBeDisabled();
  await page.locator('#redo').click();
  expect(await cells(page)).toHaveLength(5);
  // a new stroke after an undo: nothing left to redo
  await page.mouse.move(...at(9, 3)); await page.mouse.down(); await page.mouse.move(...at(10, 3)); await page.mouse.up();
  await expect(page.locator('#redo')).toBeDisabled();
  await expect(page.locator('#undo')).toBeEnabled();
  // another edit (a move) clears the history
  await page.locator('[data-action="up"]').click();
  await expect(page.locator('#undo')).toBeDisabled();
  await expect(page.locator('#redo')).toBeDisabled();
  // ERASE takes away what it passes over, and that is a stroke too
  await page.locator('#erase-tool').click();
  await page.mouse.move(...at(3.6, 0)); await page.mouse.down(); await page.mouse.move(...at(7.4, 0)); await page.mouse.up();
  expect(await cells(page, o => o.y === 0)).toEqual([['spike', 20, 0]]);
  await page.locator('#undo').click();
  expect(await cells(page, o => o.y === 0)).toHaveLength(5);
  // off again: the history buttons go, and the tool goes back to a piece
  await page.locator('#swipe-tool').click();
  await expect(page.locator('#erase-tool')).toHaveCount(0);
  await expect(page.locator('#palette button[aria-pressed="true"]')).toHaveCount(1);
});

test('SWIPE stops at the coin cap with the message a tap shows and keeps what it placed', async ({ page }) => {
  await seed(page, []);
  await openEditor(page);
  const at = await grid(page);
  await page.locator('#swipe-tool').click();
  await page.getByRole('tab', { name: 'COINS', exact: true }).click();
  await page.mouse.move(...at(4, 1)); await page.mouse.down(); await page.mouse.move(...at(18, 1)); await page.mouse.up();
  await expect(page.locator('#notice')).toContainText('10 coins');
  expect(await cells(page)).toEqual(Array.from({ length: 10 }, (_, i) => ['coin', 4 + i, 1]));
});

test('a stroke ends cleanly on a lost pointer capture, on blur and when a sheet opens; nothing keeps painting', async ({ page }) => {
  await seed(page, []);
  await openEditor(page);
  const at = await grid(page);
  await page.locator('#swipe-tool').click();
  // the capture is taken away mid-drag; the browser fires a real lostpointercapture before the
  // next pointer event, and that move paints nothing
  await page.mouse.move(...at(4, 1)); await page.mouse.down(); await page.mouse.move(...at(6, 1));
  await page.evaluate(() => document.querySelector('#world').releasePointerCapture(window.lastPointer));
  await page.mouse.move(...at(10, 1));
  await expect.poll(() => cells(page)).toEqual([['block', 4, 1], ['block', 5, 1], ['block', 6, 1]]);
  await page.mouse.move(...at(12, 1)); await page.mouse.up();
  expect(await cells(page)).toHaveLength(3);
  // the window loses focus (a dispatched blur, the event the app listens for)
  await page.mouse.move(...at(4, 2)); await page.mouse.down(); await page.mouse.move(...at(5, 2));
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  await page.mouse.move(...at(10, 2)); await page.mouse.up();
  expect(await cells(page, o => o.y === 2)).toEqual([['block', 4, 2], ['block', 5, 2]]);
  // a sheet opens mid-drag
  await page.mouse.move(...at(4, 3)); await page.mouse.down(); await page.mouse.move(...at(5, 3));
  await page.evaluate(() => document.querySelector('#level-settings').click());
  await expect(page.locator('#sheet-title')).toHaveText('Level settings');
  await page.mouse.move(...at(10, 3)); await page.mouse.up();
  expect(await cells(page, o => o.y === 3)).toEqual([['block', 4, 3], ['block', 5, 3]]);
  await page.locator('#sheet-close').click();
  // and the next drag is a fresh stroke
  await page.mouse.move(...at(4, 4)); await page.mouse.down(); await page.mouse.move(...at(6, 4)); await page.mouse.up();
  expect(await cells(page, o => o.y === 4)).toHaveLength(3);
  await page.locator('#undo').click();
  expect(await cells(page, o => o.y === 4)).toHaveLength(0);
  expect(await cells(page)).toHaveLength(7);
});

test.describe('a second finger', () => {
  test.use({ hasTouch: true });
  test('ends the stroke and pinches the last piece it placed (native touch in Chromium)', async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', 'CDP touch is Chromium only; the WebKit variant follows');
    await seed(page, []);
    await openEditor(page);
    const at = await grid(page);
    await page.locator('#swipe-tool').click();
    const cdp = await page.context().newCDPSession(page),
      touch = (type, points) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points.map(([x, y], id) => ({ x, y, id })) });
    const [ax, ay] = at(4, 0), [bx, by] = at(7, 0);
    await touch('touchStart', [[ax, ay]]);
    await touch('touchMove', [[bx, by]]);
    await touch('touchStart', [[bx, by], [bx + 100, by]]);
    // the second finger sweeps over cells 10 to 13 as it spreads: it pinches, it paints nothing
    await touch('touchMove', [[bx, by], [bx + 200, by]]);
    await touch('touchEnd', []);
    await expect.poll(() => cells(page)).toEqual([['block', 4, 0], ['block', 5, 0], ['block', 6, 0], ['block', 7, 0]]);
    // a pinch sizes both axes by one factor (#117)
    expect((await stored(page)).draft.objects[3]).toMatchObject({ scaleX: 2, scaleY: 2 });
  });
  test('ends the stroke before a pinch (native first pointer, dispatched second, in every engine)', async ({ page }) => {
    await seed(page, []);
    await openEditor(page);
    const at = await grid(page);
    await page.locator('#swipe-tool').click();
    const finger = (type, x, y) => page.locator('#world').evaluate((c, o) => c.dispatchEvent(new PointerEvent(o.type, { pointerId: 99, pointerType: 'touch', clientX: o.x, clientY: o.y, bubbles: true })), { type, x, y });
    const [bx, by] = at(7, 0);
    await page.mouse.move(...at(4, 0)); await page.mouse.down(); await page.mouse.move(bx, by);
    await finger('pointerdown', bx + 100, by);
    await finger('pointermove', bx + 200, by);
    await finger('pointerup', 0, 0);
    await page.mouse.move(...at(12, 0)); await page.mouse.up();
    expect(await cells(page)).toEqual([['block', 4, 0], ['block', 5, 0], ['block', 6, 0], ['block', 7, 0]]);
    expect((await stored(page)).draft.objects[3]).toMatchObject({ scaleX: 2, scaleY: 2 });
  });
});
