import { test, expect } from '@playwright/test';

// DIAGNOSTIC ONLY, never merged (#122). library.spec.js:103's own instrumentation and its four
// offline song renders, copied exactly, with one page global choosing a compose variant
// (src/music.ts on this branch): a unchanged, b without the LFO depth -> filter frequency edge,
// c with the LFO never stopped, d the candidate repair (never stopped, depth to 0 at the beat's
// end). COMPOSE_VARIANT comes from the workflow's matrix.
const VARIANT = process.env.COMPOSE_VARIANT ?? 'a';

test(`offline song renders, compose variant ${VARIANT}`, async ({ page }) => {
  await page.addInitScript((variant) => {
    window.__composeVariant = variant;
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
  }, VARIANT);
  await page.goto('/');
  expect(await page.evaluate(() => window.__composeVariant)).toBe(VARIANT);
  const tracks = await page.evaluate(async () => {
    const { compose } = await import('/music.js'), result = [];
    for (const index of [9, 10, 2, 0]) { const b = await compose(index), d = b.getChannelData(0); let energy = 0, peak = 0, signature = 0;
      for (let i = 0; i < d.length; i++) { energy += d[i] ** 2; peak = Math.max(peak, Math.abs(d[i])); if (i % 100 === 0) signature += d[i] * i; }
      result.push({ rms: Math.sqrt(energy / d.length), peak, signature, score: window.bufferScores.get(b) });
    } return result;
  });
  expect(tracks).toHaveLength(4);
  for (const t of tracks) expect(t.rms).toBeGreaterThan(.03);
});
