import { test, expect } from '@playwright/test';

// A completed trail keeps its song playing through the complete screen (#72); leaving for the
// menu still switches to the menu song.
test('the song keeps playing after a trail completes', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('clonedash.v1', JSON.stringify({ version: 1, best: {}, sound: true, draft: { name: 'Song run', length: 20, objects: [] } }));
    window.songs = { starts: 0, stops: 0 };
    const start = AudioBufferSourceNode.prototype.start, stop = AudioBufferSourceNode.prototype.stop;
    AudioBufferSourceNode.prototype.start = function (...args) { if (this.loop) window.songs.starts++; return start.apply(this, args); };
    AudioBufferSourceNode.prototype.stop = function (...args) { if (this.loop) window.songs.stops++; return stop.apply(this, args); };
  });
  await page.goto('/');
  await page.locator('#editor-open').click();
  await page.locator('#test-level').click();
  const playing = () => page.evaluate(() => window.songs.starts - window.songs.stops);
  await expect.poll(playing, { timeout: 10000 }).toBe(1);
  await expect(page.getByRole('heading', { name: 'Level Complete!' })).toBeVisible({ timeout: 15000 });
  const { stops } = await page.evaluate(() => window.songs);
  await page.waitForTimeout(1500);
  expect(await playing(), 'still playing on the complete screen').toBe(1);
  expect(await page.evaluate(() => window.songs.stops), 'not stopped or restarted').toBe(stops);
});
