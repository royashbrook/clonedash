import { test, expect } from '@playwright/test';

// A phone's notch, status bar and home indicator (safe-area insets): the home screen keeps its
// header below the top inset and, scrolled to the end, its last line above the bottom one, upright
// and sideways. Only Chromium can emulate insets (a devtools override), so WebKit skips: this pins
// the layout rule, it is not a check on a real phone's blur.
for (const [name, viewport, insets] of [
  ['upright, a tall phone', { width: 420, height: 912 }, { top: 62, bottom: 34, left: 0, right: 0 }],
  ['upright, a short phone', { width: 375, height: 667 }, { top: 20, bottom: 0, left: 0, right: 0 }],
  ['sideways', { width: 912, height: 420 }, { top: 0, bottom: 21, left: 62, right: 62 }],
])
  test(`home stays inside the safe area: ${name}`, async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', 'safe-area insets can only be emulated in Chromium');
    await page.setViewportSize(viewport);
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Emulation.setSafeAreaInsetsOverride', { insets });
    await page.goto('/');
    await expect(page.locator('#home > .home-head')).toBeVisible();
    const box = (selector) => page.locator(selector).evaluate((e) => { const r = e.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, left: r.left, right: r.right }; });
    const head = await box('#home > .home-head');
    expect(head.top).toBeGreaterThanOrEqual(insets.top);
    expect(head.left).toBeGreaterThanOrEqual(insets.left);
    expect(head.right).toBeLessThanOrEqual(viewport.width - insets.right);
    // the end of the screen: the last line clears the home indicator
    await page.evaluate(() => { for (const e of [document.scrollingElement, document.querySelector('#home')]) e.scrollTop = e.scrollHeight; });
    const foot = await box('#home > footer');
    expect(foot.bottom).toBeLessThanOrEqual(viewport.height - insets.bottom);
  });

// Phone portrait: a level card's note can wrap to two lines, and the card must grow with it.
// WebKit sized the flex <button> to the title's line box and let the block-level note and meta
// lines spill over the next card. Pin it at two phone widths on both engines.
for (const width of [393, 360]) {
  test.describe(`home list at ${width}px portrait`, () => {
    test.use({ viewport: { width, height: 852 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
    test('every level card contains its own note and meta lines', async ({ page }) => {
      await page.goto('/');
      const cards = await page.evaluate(() => [...document.querySelectorAll('.level-card')].map(card => {
        const c = card.getBoundingClientRect();
        const inside = [...card.querySelectorAll('small, .course-meta')].every(e => { const r = e.getBoundingClientRect(); return r.bottom <= c.bottom + 0.5 && r.top >= c.top - 0.5; });
        return { title: card.querySelector('.title')?.childNodes[0]?.textContent?.trim(), inside, height: c.height };
      }));
      expect(cards.length).toBeGreaterThan(0);
      expect(cards.filter(c => !c.inside).map(c => c.title)).toEqual([]);
      // at least one card wraps at these widths, so at least one must have grown past the 55px minimum
      expect(Math.max(...cards.map(c => c.height))).toBeGreaterThan(55.5);
    });
  });
}
