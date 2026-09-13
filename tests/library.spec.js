import { test, expect } from '@playwright/test';

const stored = page => page.evaluate(() => JSON.parse(localStorage.getItem('clonedash.v1')));
async function place(page, x, y) {
  const p = await page.evaluate(({ x, y }) => {
    const floor = document.querySelector('.editor-controls').getBoundingClientRect().top - 18;
    const top = document.querySelector('.editor-head').getBoundingClientRect().bottom;
    const unit = Math.max(12, Math.min((floor - top - 14) / 7, innerWidth / 13.5, 82));
    return { x: (x + .1 - +document.querySelector('#pan').value) * unit, y: floor - (y + .1 - +document.querySelector('#pan-y').value) * unit };
  }, { x, y });
  await page.mouse.click(p.x, p.y);
}

test('My Levels preserves a legacy draft, creates independent levels and reopens them after reload', async ({ page }) => {
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.addInitScript(() => {
    if (!localStorage.getItem('clonedash.v1')) localStorage.setItem('clonedash.v1', JSON.stringify({ version: 1, best: { 0: 100 }, sound: false, draft: { name: 'Old favorite', length: 40, objects: [{ type: 'grid', x: 6, y: 0, rotation: 0, flipX: false, flipY: false }] } }));
  });
  await page.goto('/');
  await expect(page.locator('#my-levels svg path')).toHaveAttribute('d', /M5 17H27V29H5Z M9 17 16 3 23 17/);
  await page.locator('#my-levels').click(); await expect(page.locator('.custom-card')).toHaveCount(1);
  await page.locator('#new-level').click();
  await page.locator('#level-title').fill('Sky workshop'); await page.locator('#level-title').blur();
  await page.locator('#level-settings').click(); await page.locator('#level-height').fill('20'); await page.locator('#level-height').blur();
  await page.locator('#level-song').selectOption('5'); await page.locator('#sheet-close').click();
  await page.locator('#pan-y').fill('10');
  await page.locator('#layer').selectOption('background'); await place(page, 6, 12);
  await page.locator('#layer').selectOption('play'); await place(page, 6, 12);
  await expect(page.locator('#selection')).toContainText('y 12.00');
  await page.locator('#level-settings').click(); await page.locator('#level-height').fill('7'); await page.locator('#level-height').blur();
  await expect(page.locator('#level-height')).toHaveValue('20');
  await page.locator('#sheet-close').click();
  const before = await stored(page);
  expect(before.customLevels).toHaveLength(2); expect(before.draft.objects.map(o => o.layer ?? 'play')).toEqual(['background', 'play']);
  expect(before.draft.song).toBe(5); expect(before.best[0]).toBe(100);
  await page.locator('#editor-back').click(); await page.setViewportSize({ width: 430, height: 932 });
  await expect(page.locator('#rotate')).toBeHidden(); await expect(page.locator('.custom-card')).toHaveCount(2);
  await page.screenshot({ path: `test-results/library-${test.info().project.name}.png` });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(430);
  await page.reload(); await page.locator('#my-levels').click();
  await expect(page.locator('.custom-card').filter({ hasText: 'Sky workshop' })).toContainText('40 × 20 blocks');
  await page.setViewportSize({ width: 932, height: 430 });
  await page.getByRole('button', { name: 'Edit Old favorite', exact: true }).click();
  expect((await stored(page)).draft).toEqual(before.customLevels[0].level);
  await page.locator('#editor-back').click(); await page.getByRole('button', { name: 'Play Sky workshop', exact: true }).click();
  await expect(page.locator('#level-name')).toContainText('Sky workshop');
  await page.locator('#pause').click(); await page.getByRole('button', { name: 'BACK TO EDITOR', exact: true }).click();
  await page.screenshot({ path: `test-results/tall-editor-${test.info().project.name}.png` });
  expect((await stored(page)).draft).toEqual(before.draft); expect(errors).toEqual([]);
});

test('malformed library is never overwritten by creating or editing', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('clonedash.v1', JSON.stringify({ version: 1, best: {}, sound: false, draft: { name: 'Keep me', length: 40, objects: [] }, customLevels: [], activeLevel: 1 })));
  await page.goto('/'); const before = await page.evaluate(() => localStorage.getItem('clonedash.v1'));
  await page.locator('#my-levels').click(); await page.locator('#new-level').click(); await place(page, 6, 0);
  await expect(page.locator('#draft-status')).toContainText('NOT SAVED');
  expect(await page.evaluate(() => localStorage.getItem('clonedash.v1'))).toBe(before);
});

test('background paints behind foreground regardless of placement order and selects only its own layer', async ({ page }) => {
  await page.clock.install(); await page.goto('/'); await page.locator('#editor-open').click();
  await page.getByRole('button', { name: '■ NO BORDER', exact: true }).click(); await place(page, 6, 1);
  await page.locator('#layer').selectOption('background'); await place(page, 6, 1); await place(page, 8, 1);
  await page.locator('#select-tool').click(); await place(page, 6, 1);
  await expect(page.locator('#selection')).toContainText('BACKGROUND');
  await page.locator('#layer').selectOption('play'); await page.locator('#select-tool').click(); await place(page, 6, 1);
  await expect(page.locator('#selection')).toContainText('PLAIN-BLACK');
  await page.clock.runFor(32);
  const paint = await page.evaluate(() => {
    const c = document.querySelector('#world'), d = c.width / innerWidth;
    const floor = document.querySelector('.editor-controls').getBoundingClientRect().top - 18, top = document.querySelector('.editor-head').getBoundingClientRect().bottom;
    const unit = Math.max(12, Math.min((floor - top - 14) / 7, innerWidth / 13.5, 82));
    const pixel = x => [...c.getContext('2d').getImageData(Math.floor(x * unit * d), Math.floor((floor - 1.5 * unit) * d), 1, 1).data];
    return { solid: pixel(6.5), backdrop: pixel(8.5), empty: pixel(10.5) };
  });
  expect(paint.solid).toEqual([0, 0, 0, 255]); expect(paint.backdrop).not.toEqual(paint.empty);
  await page.screenshot({ path: `test-results/background-layer-${test.info().project.name}.png` });
});

test('camera follows a high jumper without shrinking the character or pinning it offscreen', async ({ page }) => {
  await page.clock.install();
  await page.addInitScript(() => {
    localStorage.setItem('clonedash.v1', JSON.stringify({ version: 1, best: {}, sound: false, draft: { name: 'Tall flight', length: 100, height: 20, objects: [{ type: 'jumper', x: 3, y: 0, rotation: 0, flipX: false, flipY: false }] } }));
    const fill = CanvasRenderingContext2D.prototype.fillRect;
    CanvasRenderingContext2D.prototype.fillRect = function(x, y, w, h) {
      if (this.fillStyle === '#9aff6b' && w === h && w > 20 && w < 60) window.playerPaint = { y: this.getTransform().f, width: w };
      if (this.fillStyle === '#9aff6b' && w === innerWidth && h === 2) window.groundY = y;
      return fill.call(this, x, y, w, h);
    };
  });
  await page.goto('/'); await page.locator('#editor-open').click(); await page.locator('#test-level').click(); await page.clock.runFor(900);
  await expect(page.locator('#level-name')).toContainText('JUMPER');
  const ground = await page.evaluate(() => ({ player: window.playerPaint, ground: window.groundY }));
  for (let i = 0; i < 18; i++) { await page.keyboard.down('Space'); await page.clock.runFor(20); await page.keyboard.up('Space'); await page.clock.runFor(180); }
  const high = await page.evaluate(() => ({ player: window.playerPaint, ground: window.groundY }));
  expect(high.ground).toBeGreaterThan(ground.ground + 200); expect(high.player.width).toBe(ground.player.width);
  expect(high.player.y).toBeGreaterThan(75); expect(high.player.y).toBeLessThan(360);
  await expect(page.locator('#attempt')).toHaveText('TRY 1'); await page.screenshot({ path: `test-results/tall-flight-${test.info().project.name}.png` });
});

test('custom originals are audibly distinct and selecting a song plays that actual buffer', async ({ page }) => {
  await page.addInitScript(() => {
    window.loopScores = []; window.bufferScores = new WeakMap();
    const contextScores = new WeakMap(), create = OfflineAudioContext.prototype.createOscillator;
    OfflineAudioContext.prototype.createOscillator = function() {
      const o = create.call(this), start = o.start, context = this;
      o.start = function(...args) {
        if (!contextScores.has(context)) contextScores.set(context, []);
        contextScores.get(context).push([o.type, o.frequency.value]);
        return start.apply(this, args);
      }; return o;
    };
    const render = OfflineAudioContext.prototype.startRendering;
    OfflineAudioContext.prototype.startRendering = async function() {
      const buffer = await render.call(this);
      window.bufferScores.set(buffer, JSON.stringify(contextScores.get(this))); return buffer;
    };
    const start = AudioBufferSourceNode.prototype.start;
    AudioBufferSourceNode.prototype.start = function(...args) {
      if (this.loop && this.buffer) window.loopScores.push(window.bufferScores.get(this.buffer));
      return start.apply(this, args);
    };
  });
  await page.goto('/'); await page.locator('#my-levels').click(); await page.locator('#new-level').click();
  await page.locator('#level-settings').click(); await expect(page.locator('#level-song')).toHaveValue('10');
  const tracks = await page.evaluate(async () => {
    const { compose } = await import('/music.js'), result = [];
    for (const index of [9, 10, 2, 0]) { const b = await compose(index), d = b.getChannelData(0); let energy = 0, peak = 0, signature = 0;
      for (let i = 0; i < d.length; i++) { energy += d[i] ** 2; peak = Math.max(peak, Math.abs(d[i])); if (i % 100 === 0) signature += d[i] * i; }
      result.push({ rms: Math.sqrt(energy / d.length), peak, signature, score: window.bufferScores.get(b) });
    } return result;
  });
  expect(new Set(tracks.map(t => t.signature)).size).toBe(4);
  expect(new Set(tracks.map(t => t.score)).size).toBe(4);
  for (const t of tracks) { expect(t.rms).toBeGreaterThan(.03); expect(t.peak).toBeLessThan(1); }
  await page.locator('#level-song').selectOption('2'); await page.getByRole('button', { name: 'LISTEN', exact: true }).click();
  // Compare the exact oscillator score attached to the actual playing buffer. Separate
  // offline renders are not bit-identical, so PCM equality is not a song identity test.
  await expect.poll(() => page.evaluate(() => window.loopScores.at(-1)), { timeout: 20000 }).toBe(tracks[2].score);
  await page.locator('#sheet-close').click(); await page.locator('#test-level').click();
  await expect.poll(() => page.evaluate(() => window.loopScores.length)).toBeGreaterThan(1);
  expect(await page.evaluate(() => window.loopScores.at(-1))).toBe(tracks[2].score);
  expect((await stored(page)).draft.song).toBe(2);
});
