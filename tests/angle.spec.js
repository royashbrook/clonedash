import { test, expect } from '@playwright/test';

// The angle mode from the player's side: a palette entry, the HUD label and cue, and a run
// that climbs to the ceiling while held and dives to the floor when released without dying.
test('angle portal is placeable, shows its cue, and rides ceiling and floor without dying', async ({ page }) => {
  await page.clock.install();
  await page.addInitScript(() => {
    const piece = (type, x, y = 0) => ({ type, x, y, rotation: 0, flipX: false, flipY: false });
    localStorage.setItem('clonedash.v1', JSON.stringify({ version: 1, best: {}, sound: false, draft: { name: 'Angle run', length: 60, objects: [piece('angle', 3)] } }));
  });
  await page.goto('/'); await page.locator('#editor-open').click();
  await page.getByRole('tab', { name: 'PORTALS', exact: true }).click();
  await expect(page.getByRole('button', { name: '◢ ANGLE', exact: true })).toBeVisible();
  await page.locator('#test-level').click();
  await page.clock.runFor(900);
  await expect(page.locator('#level-name')).toContainText('ANGLE ↓');
  await expect(page.locator('#cue')).toContainText('HOLD TO CLIMB');
  await page.keyboard.down('Space'); await page.clock.runFor(2500); // well past the ceiling
  await page.keyboard.up('Space'); await page.clock.runFor(2500); // and back past the floor
  await expect(page.locator('#attempt')).toHaveText('TRY 1');
  const x = await page.locator('#run-progress').evaluate(e => 1 + e.value / 100 * 59);
  expect(x).toBeGreaterThan(20);
});
