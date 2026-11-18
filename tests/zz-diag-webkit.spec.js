import { test, expect } from '@playwright/test';

// DIAGNOSTIC ONLY, never merged (#122): the two engine operations that failed with "WebKit
// encountered an internal error" on hosted runs, in their smallest form, with nothing else in
// the case. Each repeat is one case; the workflow sets the repeat count and retries 0.

test('the game page reloads, as the failing share test does', async ({ page }) => {
  // recorded, not assumed, per load: whether the navigation's response came from a service
  // worker, and whether one controlled the page after it. kept even when a reload fails.
  const loads = [];
  try {
    await page.goto('/');
    await expect(page.locator('#play')).toBeVisible();
    for (let i = 0; i < 10; i++) {
      const response = await page.reload();
      const record = { load: i, status: response?.status() ?? null, fromServiceWorker: response?.fromServiceWorker() ?? null };
      loads.push(record);
      await expect(page.locator('#play')).toBeVisible();
      record.controlled = await page.evaluate(() => !!navigator.serviceWorker?.controller);
    }
  } finally {
    await test.info().attach('loads', { body: JSON.stringify(loads), contentType: 'application/json' });
  }
});

test('a blob stream reads through the compressor, the way a share code is made', async ({ page }) => {
  await page.goto('/');
  const sizes = await page.evaluate(async () => {
    const out = [];
    for (let i = 0; i < 25; i++) {
      const raw = new TextEncoder().encode(JSON.stringify({ i, objects: Array.from({ length: 400 }, (_, k) => ({ type: 'block', x: k, y: k % 7 })) }));
      const packed = await new Response(new Blob([raw]).stream().pipeThrough(new CompressionStream('deflate-raw'))).arrayBuffer();
      out.push(packed.byteLength);
    }
    return out;
  });
  expect(sizes).toHaveLength(25);
  expect(sizes.every((n) => n > 0)).toBe(true);
});
