import { test, expect } from "./quiet.mjs";

// The home screen fits on an ipad held either way: every button of the bottom bar is on screen
// without sliding the page, and the trail list scrolls inside its own panel instead (#65).
for (const [name, width, height] of [['ipad 10.2 landscape', 1080, 810], ['ipad mini landscape', 1133, 744], ['ipad in safari landscape', 1180, 740], ['ipad mini portrait', 744, 1133], ['laptop', 1280, 720]])
  test(`home fits without scrolling: ${name}`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await page.goto('/');
    const fit = await page.evaluate(() => {
      const home = document.querySelector('#home');
      return {
        scrolls: home.scrollHeight > home.clientHeight + 1,
        buttons: [...document.querySelectorAll('#dock button')].map(b => [b.textContent.trim(), Math.round(b.getBoundingClientRect().bottom)]),
        inner: innerHeight,
      };
    });
    expect(fit.scrolls, 'home slides').toBe(false);
    expect(fit.buttons.map(([label]) => label)).toEqual(['PLAY', 'BUILD', 'LOOKS', 'MUSIC', 'MORE']);
    for (const [label, bottom] of fit.buttons) expect(bottom, label).toBeLessThanOrEqual(fit.inner);
  });
