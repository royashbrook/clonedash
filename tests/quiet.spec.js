import { test, expect } from "./quiet.mjs";

// Browser tests are quiet by default (tests/quiet.mjs). The first check holds in every engine with
// nothing able to sound: a context made but never started. The second plays the game with sound on
// and shows nothing reached the speakers except through the silent gain. It is skipped for WebKit
// on a local machine (it would be audible if the setup were broken): the hosted runs check it there.
test("a live context's destination is a silent gain; an offline render keeps its real one", async ({ page, browser, baseURL }) => {
  // the default page, and a page in a context the test makes itself, as most audio tests do
  const own = await browser.newContext({ baseURL });
  for (const p of [page, await own.newPage()]) await check(p);
  await own.close();
});
async function check(page) {
  await page.goto("/");
  const seen = await page.evaluate(() => {
    const live = new AudioContext(),
      offline = new OfflineAudioContext(1, 128, 44100),
      d = live.destination,
      out = { gain: d instanceof GainNode, value: d instanceof GainNode && d.gain.value, same: d === live.destination };
    out.offline = offline.destination instanceof AudioDestinationNode;
    void live.close();
    return out;
  });
  expect(seen).toEqual({ gain: true, value: 0, same: true, offline: true });
}

test("the game with sound on reaches the speakers only through the silent gain", async ({ page, browserName }) => {
  test.skip(browserName === "webkit" && !process.env.CI, "checked in the hosted runs, never played aloud here");
  await page.goto("/");
  await page.locator("#sound").click();
  await expect(page.locator("#sound")).toHaveText("SOUND ON");
  await page.locator("#play").click();
  await page.waitForTimeout(1500);
  await page.keyboard.press("Space");
  await page.waitForTimeout(500);
  const { loud, through } = await page.evaluate(() => window.__quiet);
  expect(through, "the game played: its music and sounds went into the silent gain").toBeGreaterThan(0);
  expect(loud).toBe(0);
});
