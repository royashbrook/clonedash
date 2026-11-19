import { test as base, expect } from "@playwright/test";

// Browser tests are quiet by default, in every engine. Chromium headless is already muted, but
// WebKit on a Mac plays to the real speakers. So each page gets this before its own scripts: a
// live AudioContext hands out a silent gain node as its destination, connected to the real one.
// The game's graph, its clocks and every node still run; the speakers get zeros. Offline renders
// keep their real destination, so the songs render exactly as before. Tests only, never the game.
export function quiet() {
  if (window.__quiet || typeof AudioContext === "undefined") return;
  const real = Object.getOwnPropertyDescriptor(BaseAudioContext.prototype, "destination").get;
  const silent = new WeakMap(),
    outputs = new WeakSet();
  window.__quiet = { loud: 0, through: 0 };
  Object.defineProperty(AudioContext.prototype, "destination", {
    configurable: true,
    get() {
      let gain = silent.get(this);
      if (!gain) {
        gain = this.createGain();
        gain.gain.value = 0;
        // known before it connects, so a connect hook that asks for the destination gets this one
        silent.set(this, gain);
        outputs.add(gain);
        gain.connect(real.call(this));
      }
      return gain;
    },
  });
  // what reaches the silent gains, and anything that still reaches a live context's speakers some
  // other way, are counted, so a test can show the page played and made no sound
  const connect = AudioNode.prototype.connect;
  AudioNode.prototype.connect = function (target, ...rest) {
    if (outputs.has(target)) window.__quiet.through++;
    if (target instanceof AudioDestinationNode && target.context instanceof AudioContext && !outputs.has(this))
      window.__quiet.loud++;
    return connect.call(this, target, ...rest);
  };
}

export const test = base.extend({
  // pages from the default context
  context: async ({ context }, use) => {
    await context.addInitScript(quiet);
    await use(context);
  },
  // and contexts a test makes itself
  browser: [
    async ({ browser }, use) => {
      const newContext = browser.newContext.bind(browser);
      browser.newContext = async (...args) => {
        const context = await newContext(...args);
        await context.addInitScript(quiet);
        return context;
      };
      await use(browser);
    },
    { scope: "worker" },
  ],
});
export { expect };
