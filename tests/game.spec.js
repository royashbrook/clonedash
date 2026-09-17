import { test, expect } from '@playwright/test';
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
async function startServer(change = (_file, data) => data) {
  const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml' };
  const server = http.createServer(async (req, res) => {
    try {
      const path = new URL(req.url, 'http://localhost').pathname, file = resolve('dist', `.${path === '/' ? '/index.html' : path}`);
      if (!file.startsWith(resolve('dist') + '/')) { res.writeHead(403).end(); return; }
      const data = change(file, await readFile(file)); res.writeHead(200, { 'content-type': types[extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' }).end(data);
    } catch { res.writeHead(404).end(); }
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  return { url: `http://127.0.0.1:${server.address().port}/`, close: () => server.listening ? new Promise(r => { server.close(r); server.closeAllConnections(); }) : Promise.resolve() };
}
test('home is an eighteen-trail picker; play fills the screen; pause and rotate preserve progress', async ({ page }) => {
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto('/'); await expect(page.locator('.level-card')).toHaveCount(18);
  await page.screenshot({ path: 'test-results/home-landscape.png' });
  await page.getByRole('button', { name: 'Play First Spark', exact: true }).click();
  await page.waitForTimeout(700);
  expect(await page.locator('#world').boundingBox()).toEqual({ x: 0, y: 0, width: 932, height: 430 });
  await page.screenshot({ path: 'test-results/play-landscape.png' });
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  const p = await page.locator('#run-progress').evaluate(e => e.value);
  await page.waitForTimeout(700); expect(await page.locator('#run-progress').evaluate(e => e.value)).toBe(p);
  await page.getByRole('button', { name: 'RESUME', exact: true }).click();
  await page.setViewportSize({ width: 430, height: 932 }); await expect(page.locator('#rotate')).toBeVisible();
  await page.locator('#rotate-menu').click(); await expect(page.locator('#home')).toBeVisible();
  await page.screenshot({ path: 'test-results/home-portrait.png' });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(430); expect(errors).toEqual([]);
});
test('editor places, selects, micro-adjusts, rotates, flips and persists; test returns to same draft', async ({ page }) => {
  await page.clock.install(); await page.goto('/'); await page.clock.runFor(32);
  // Keep RAF paused: the first editor tap must not reuse the last home-frame geometry.
  await page.locator('#editor-open').click();
  const point = await page.evaluate(() => {
    const top = document.querySelector('.editor-head').getBoundingClientRect().bottom;
    const floor = document.querySelector('.editor-controls').getBoundingClientRect().top - 18;
    const unit = Math.max(12, Math.min((floor - top - 14) / 7, innerWidth / 13.5, 82));
    return { x: 6 * unit, y: floor - .2 * unit };
  });
  await page.mouse.click(point.x, point.y);
  await expect(page.locator('#selection')).toContainText('BLOCK');
  await page.locator('#step-size').selectOption('0.05');
  await page.getByRole('button', { name: 'Move right', exact: true }).click();
  await expect(page.locator('#selection')).toContainText('6.05');
  await page.getByRole('button', { name: 'Rotate clockwise', exact: true }).click();
  await expect(page.locator('#selection')).toContainText('270°');
  await page.getByRole('button', { name: 'FLIP ↔', exact: true }).click();
  const draft = await page.evaluate(() => JSON.parse(localStorage.getItem('clonedash.v1')).draft);
  expect(draft.objects[0].flipX).toBe(true);
  await page.locator('#test-level').click(); await page.locator('#pause').click();
  await page.getByRole('button', { name: 'BACK TO EDITOR', exact: true }).click();
  await expect(page.locator('#selection')).toContainText('6.05');
  await page.screenshot({ path: 'test-results/editor-landscape.png' });
  await page.reload(); await page.locator('#editor-open').click();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('clonedash.v1')).draft)).toEqual(draft);
});
test('first trail can be completed with actual Space events; replay and completion persist', async ({ page }) => {
  await page.clock.install(); await page.goto('/');
  await page.getByRole('button', { name: 'Play First Spark', exact: true }).click();
  const obstacles = [6, 12, 18, 24, 30]; let lastJump = -10;
  for (let i = 0; i < 600; i++) {
    if (await page.getByRole('heading', { name: 'Level Complete!' }).isVisible()) break;
    const percent = await page.locator('#run-progress').evaluate(e => e.value), x = 1 + percent / 100 * 33;
    if (obstacles.some(o => o - x > 1.7 && o - x < 2.1) && x - lastJump > 2) { await page.keyboard.down('Space'); lastJump = x; } else await page.keyboard.up('Space');
    await page.clock.runFor(20);
  }
  await expect(page.getByRole('heading', { name: 'Level Complete!' })).toBeVisible();
  expect(await page.locator('#attempt').textContent()).toBe('TRY 1');
  await page.getByRole('button', { name: 'Restart Level', exact: true }).click(); await expect(page.locator('#hud')).toBeVisible();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('clonedash.v1')).best[0])).toBe(100);
});
test('blocked storage and malformed saves do not block play or overwrite the old save', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('clonedash.v1', '{bad'));
  await page.goto('/'); await expect(page.locator('#notice')).toContainText('Storage unavailable');
  await page.getByRole('button', { name: 'Play First Spark', exact: true }).click(); await expect(page.locator('#hud')).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('clonedash.v1'))).toBe('{bad');
});
test('real Space input lands the painted square on a two-block editor ledge', async ({ page }) => {
  await page.clock.install();
  await page.addInitScript(() => {
    const block = (x, y) => ({ type: 'grid', x, y, rotation: 0, flipX: false, flipY: false });
    localStorage.setItem('clonedash.v1', JSON.stringify({ version: 1, best: {}, sound: false, draft: { name: 'Two-block ledge', length: 20, objects: [block(5, 0), block(5, 1), block(6, 1), block(7, 1)] } }));
    const fill = CanvasRenderingContext2D.prototype.fillRect;
    CanvasRenderingContext2D.prototype.fillRect = function (x, y, w, h) {
      if (this.fillStyle === '#9aff6b' && w === h && w > 20 && w < 60) window.squarePaint = { y: this.getTransform().f, width: w };
      return fill.call(this, x, y, w, h);
    };
  });
  await page.goto('/'); await page.locator('#editor-open').click(); await page.locator('#test-level').click();
  await page.clock.runFor(100);
  const ground = await page.evaluate(() => window.squarePaint);
  for (let i = 0; i < 50; i++) {
    const x = 1 + await page.locator('#run-progress').evaluate(e => e.value) / 100 * 19;
    if (x >= 2.1) break;
    await page.clock.runFor(20);
  }
  await page.keyboard.down('Space'); await page.clock.runFor(40); await page.keyboard.up('Space');
  await page.clock.runFor(760);
  expect(await page.locator('#attempt').textContent()).toBe('TRY 1');
  const landed = await page.evaluate(() => window.squarePaint);
  expect(ground.y - landed.y).toBeCloseTo(2 * ground.width / .64, 1);
  await page.screenshot({ path: 'test-results/two-block-landing.png' });
});
test('served-shell update appears without restarting', async ({ browser }) => {
  let changed = false;
  const server = await startServer((file, data) => changed && file.endsWith('/index.html') ? Buffer.from(data.toString().replace(/name="build" content="[^"]+"/, 'name="build" content="another-build"')) : data);
  const context = await browser.newContext(), page = await context.newPage();
  try {
    await page.goto(server.url); await page.evaluate(() => navigator.serviceWorker.ready);
    await page.reload(); await page.waitForFunction(() => !!navigator.serviceWorker.controller);
    changed = true;
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    await expect(page.locator('#update')).toBeVisible();
  } finally { await context.close(); await server.close(); }
});
test('offline shell reopens after the actual server goes away', async ({ browser }) => {
  // WebKit setOffline rejects even a worker returning a constant Response without fetching.
  // Stop our own disposable server instead: real connection refusal, same shipped worker/assets.
  const server = await startServer();
  const context = await browser.newContext(), page = await context.newPage();
  try {
    await page.goto(server.url); await page.evaluate(() => navigator.serviceWorker.ready);
    await page.reload(); await page.waitForFunction(() => !!navigator.serviceWorker.controller);
    expect(await page.evaluate(async () => !!(await caches.match('/index.html')))).toBe(true);
    expect(await page.evaluate(async () => !!(await caches.match('/music/zero-to-100.mp3')))).toBe(true);
    await server.close();
    await page.reload(); await expect(page.locator('.level-card')).toHaveCount(18);
    const duration = await page.evaluate(async () => {
      const c = new AudioContext();
      try { return (await c.decodeAudioData(await (await fetch('/music/zero-to-100.mp3')).arrayBuffer())).duration; }
      finally { await c.close(); }
    });
    expect(duration).toBeGreaterThan(29);
    await page.getByRole('button', { name: 'Play First Spark', exact: true }).click(); await expect(page.locator('#hud')).toBeVisible();
  } finally { await context.close(); await server.close(); }
});
test('sound on starts actual menu music; nine original tracks have audible, distinct PCM', async ({ page }) => {
  await page.addInitScript(() => {
    window.audioStarts = [];
    window.audioStops = 0;
    const original = AudioBufferSourceNode.prototype.start;
    const originalStop = AudioBufferSourceNode.prototype.stop;
    AudioBufferSourceNode.prototype.start = function (...args) { if (this.buffer && this.loop) window.audioStarts.push({ duration: this.buffer.duration, length: this.buffer.length }); return original.apply(this, args); };
    AudioBufferSourceNode.prototype.stop = function (...args) { if (this.buffer && this.loop) window.audioStops++; return originalStop.apply(this, args); };
  });
  await page.goto('/'); await page.getByRole('button', { name: 'Turn sound on', exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.audioStarts.length)).toBeGreaterThan(0);
  const result = await page.evaluate(async () => {
    const { compose } = await import('/music.js'); const tracks = [];
    for (let i = 0; i < 9; i++) {
      const buffer = await compose(i), data = buffer.getChannelData(0); let energy = 0, peak = 0, signature = 0;
      for (let n = 0; n < data.length; n++) { energy += data[n] ** 2; peak = Math.max(peak, Math.abs(data[n])); if (n % 100 === 0) signature += data[n] * n; }
      tracks.push({ duration: buffer.duration, rms: Math.sqrt(energy / data.length), peak, signature });
    }
    return tracks;
  });
  for (const t of result) { expect(t.duration).toBeCloseTo(25.6, 2); expect(t.rms).toBeGreaterThan(.03); expect(t.peak).toBeLessThan(1); }
  expect(new Set(result.map(t => t.signature)).size).toBe(9);
  const stoppedBefore = await page.evaluate(() => window.audioStops);
  await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, value: true }); document.dispatchEvent(new Event('visibilitychange')); });
  expect(await page.evaluate(() => window.audioStops)).toBeGreaterThan(stoppedBefore);
  await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, value: false }); document.dispatchEvent(new Event('visibilitychange')); });
  await page.getByRole('button', { name: 'Turn sound off', exact: true }).click();
});
test('touch anywhere triggers jump input and releases cleanly', async ({ browser, baseURL }) => {
  const context = await browser.newContext({ viewport: { width: 932, height: 430 }, hasTouch: true });
  await context.addInitScript(() => {
    window.playerPaintY = [];
    const fill = CanvasRenderingContext2D.prototype.fillRect;
    CanvasRenderingContext2D.prototype.fillRect = function (x, y, w, h) {
      if (this.fillStyle === '#9aff6b' && w === h && w > 20 && w < 60) window.playerPaintY.push(this.getTransform().f);
      return fill.call(this, x, y, w, h);
    };
  });
  const page = await context.newPage(); await page.goto(baseURL);
  await page.getByRole('button', { name: 'Play First Spark', exact: true }).click();
  await page.waitForTimeout(500); await expect(page.locator('#cue')).toBeVisible();
  const ground = await page.evaluate(() => { const y = window.playerPaintY.at(-1); window.playerPaintY = []; return y; });
  await page.touchscreen.tap(730, 220); await expect(page.locator('#cue')).toBeHidden();
  await page.waitForTimeout(180); await page.screenshot({ path: 'test-results/touch-jump.png' });
  expect(await page.evaluate(() => Math.min(...window.playerPaintY))).toBeLessThan(ground - 15);
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Paused' })).toBeVisible(); await context.close();
});
