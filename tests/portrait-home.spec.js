import { test, expect } from '@playwright/test';

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
