import { test, expect } from "./quiet.mjs";

test("a cold trail prepares on Play, keeps moving, and joins at the elapsed run time", async ({ page }) => {
  await page.addInitScript(() => {
    const level = { name: "Beat road", length: 200, objects: [], song: 1 };
    localStorage.setItem("clonedash.v1", JSON.stringify({version:1, sound:true, best:{}, draft:level,
      activeLevel:1, customLevels:[{id:1,level}]}));
    OfflineAudioContext.prototype.startRendering = function () {
      return new Promise(ok => { window.finishSong = () => ok(new AudioBuffer({numberOfChannels:1, length:88200, sampleRate:44100})); });
    };
    const start = AudioBufferSourceNode.prototype.start;
    AudioBufferSourceNode.prototype.start = function (when, offset) {
      if (this.loop && this.buffer.duration === 2) window.trailOffset = offset;
      return start.apply(this, arguments);
    };
  });
  await page.clock.install({time:0});
  await page.goto("/");
  await page.clock.pauseAt(test.info().timeout);
  await page.locator("#my-levels").click();
  await page.getByRole("button", {name:"Play Beat road",exact:true}).click();
  expect(await page.evaluate(() => typeof window.finishSong)).toBe("function");
  await page.clock.runFor(1400);
  expect(await page.evaluate(() => window.trailOffset)).toBeUndefined();
  await page.evaluate(() => window.finishSong());
  await expect.poll(() => page.evaluate(() => window.trailOffset)).toBeGreaterThan(.92);
  expect(await page.evaluate(() => window.trailOffset)).toBeLessThan(1.05);
});

test("sound off disconnects the live song before saving, in the same tap", async ({ page }) => {
  await page.addInitScript(() => {
    const events = window.soundEvents = [];
    const start = AudioBufferSourceNode.prototype.start;
    AudioBufferSourceNode.prototype.start = function (...args) {
      if (this.loop) events.push("play");
      return start.apply(this, args);
    };
    const disconnect = GainNode.prototype.disconnect;
    GainNode.prototype.disconnect = function (...args) {
      if (this.context instanceof AudioContext) events.push("cut");
      return disconnect.apply(this, args);
    };
    const set = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key === "clonedash.v1" && !JSON.parse(value).sound) events.push("save-off");
      return set.call(this, key, value);
    };
  });
  await page.goto("/");
  await page.locator("#sound").click();
  await expect.poll(() => page.evaluate(() => window.soundEvents.includes("play"))).toBe(true);
  const events = await page.evaluate(() => {
    window.soundEvents.length = 0;
    document.querySelector("#sound").click();
    return window.soundEvents;
  });
  expect(events).toEqual(["cut", "save-off"]);
});
