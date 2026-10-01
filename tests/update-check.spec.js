import { test, expect } from '@playwright/test';

// CHECK FOR UPDATE says what it found (#66), and pulling the home screen down checks too, and
// installs when there is something to install (#67). The service worker is blocked so the probe's
// answer comes from the route below; the install path itself is covered in update.spec.js.
test.use({ serviceWorkers: 'block' });
const answer = (page, reply) => {
  const seen = { probes: 0 };
  page.route((url) => url.searchParams.has('update-probe'), async (route) => { seen.probes++; await reply(route); });
  return seen;
};
const build = (page) => page.locator('meta[name=build]').getAttribute('content');
const meta = (content) => ({ status: 200, contentType: 'text/html', body: `<!doctype html><meta name="build" content="${content}">` });
async function check(page) {
  await page.locator('#about').click();
  await page.locator('#check-update').click();
}

test('the about check says checking, then that this is the newest version', async ({ page }) => {
  await page.goto('/');
  const current = await build(page);
  let release;
  answer(page, async (route) => { await new Promise((r) => (release = r)); await route.fulfill(meta(current)); });
  await check(page);
  await expect(page.locator('#check-update')).toHaveText('CHECKING…');
  await expect(page.locator('#check-update')).toBeDisabled();
  release();
  await expect(page.locator('#notice')).toContainText('You have the newest version');
  await expect(page.locator('#check-update')).toHaveText('CHECK FOR UPDATE');
  await expect(page.locator('#update')).toBeHidden();
});

test('the about check finds a new version and offers it', async ({ page }) => {
  await page.goto('/');
  answer(page, (route) => route.fulfill(meta('fedcba987654')));
  await check(page);
  await expect(page.locator('#notice')).toContainText('A new version is ready');
  await expect(page.locator('#update')).toBeVisible();
});

test('the about check says when it could not reach the server', async ({ page }) => {
  await page.goto('/');
  answer(page, (route) => route.abort());
  await check(page);
  await expect(page.locator('#notice')).toContainText('Could not check for updates');
});

test.describe('pulling the home screen down', () => {
  test.skip(({ browserName }) => browserName !== 'chromium', 'touch drags come from chromium devtools input');
  test.use({ viewport: { width: 1080, height: 810 }, hasTouch: true });
  async function drag(page, distance, during) {
    const cdp = await page.context().newCDPSession(page);
    const at = (y) => [{ x: 200, y }];
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: at(120) });
    for (let y = 120; y <= 120 + distance; y += 20) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: at(y) });
    await during?.();
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  }
  test('a long pull shows let go, then checks', async ({ page }) => {
    await page.goto('/');
    const current = await build(page);
    const seen = answer(page, (route) => route.fulfill(meta(current)));
    await drag(page, 200, async () => {
      await expect(page.locator('#pull')).toBeVisible();
      await expect(page.locator('#pull')).toHaveText('LET GO TO CHECK FOR UPDATES');
    });
    await expect(page.locator('#notice')).toContainText('You have the newest version');
    expect(seen.probes).toBe(1);
    await expect(page.locator('#pull')).toBeHidden();
  });
  test('a short pull does nothing', async ({ page }) => {
    await page.goto('/');
    const seen = answer(page, (route) => route.fulfill(meta('x')));
    await drag(page, 60, () => expect(page.locator('#pull')).toHaveText('PULL TO CHECK FOR UPDATES'));
    await page.waitForTimeout(300);
    expect(seen.probes).toBe(0);
    await expect(page.locator('#pull')).toBeHidden();
  });
  test('a pull that finds a new version goes straight to installing it', async ({ page }) => {
    await page.goto('/');
    answer(page, (route) => route.fulfill(meta('fedcba987654')));
    await drag(page, 200);
    // with the worker blocked the install cannot run, so its own failure message proves it started
    await expect(page.locator('#notice')).toContainText('Update could not download');
    await expect(page.locator('#notice')).not.toContainText('Tap NEW VERSION READY');
  });
});
