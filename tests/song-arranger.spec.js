import { test, expect } from "./quiet.mjs";
import { blankLoop, encodeLoop, loopLink, LOOPS } from "../src/loop.ts";
import { SONG_KEY } from "../src/arrangement.ts";
import { encodeLevel } from "../src/transfer.ts";

test("an imported trail plays both sections in order with no song or loop library", async ({
  page,
}) => {
  const hook = {
      ...blankLoop(),
      name: "Hook",
      drop: false,
      notes: [[0], [], [], [], [], [], [], []],
    },
    ending = { ...hook, root: 48 };
  const song = {
    name: "Two keys",
    bpm: 200,
    sections: [
      { loop: hook, repeats: 1 },
      { loop: ending, repeats: 1 },
    ],
  };
  const code = await encodeLevel({
    name: "Song trail",
    length: 120,
    objects: [],
    arrangement: song,
  });
  await page.addInitScript(() => {
    const start = OscillatorNode.prototype.start;
    window.leadPitches = [];
    OscillatorNode.prototype.start = function (...args) {
      if (this.context instanceof AudioContext && this.type === "triangle")
        window.leadPitches.push(Math.round(this.frequency.value));
      return start.apply(this, args);
    };
  });
  await page.goto("/");
  await page.locator("#sound").click();
  await page.goto("/#level=" + code);
  await expect(page.locator("#sheet")).toContainText("Two keys (its own song)");
  await page.locator("#add-level").click();
  expect(
    await page.evaluate((k) => localStorage.getItem(k), SONG_KEY),
  ).toBeNull();
  await page
    .getByRole("button", { name: "Play Song trail", exact: true })
    .click();
  await expect
    .poll(
      () =>
        page.evaluate(() =>
          window.leadPitches.filter((p) => p === 330 || p === 523),
        ),
      { timeout: 10000 },
    )
    .toEqual(expect.arrayContaining([330, 523]));
});

test("a phone builds a song from a saved loop and a shared link, edits just the ending and reloads", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 664 });
  await page.addInitScript(() => {
    const calls = new WeakMap();
    for (const action of ["resume", "suspend", "close"]) {
      const original = AudioContext.prototype[action];
      AudioContext.prototype[action] = function (...args) {
        if (!calls.has(this)) calls.set(this, []);
        calls.get(this).push(action);
        if (action === "resume") window.songAudioCalls = calls.get(this);
        return original.apply(this, args);
      };
    }
  });
  const original = { ...blankLoop(), name: "Bassline" };
  await page.addInitScript(
    ({ key, loop }) => {
      if (!localStorage.getItem(key))
        localStorage.setItem(
          key,
          JSON.stringify({ version: 1, next: 2, loops: [{ id: 1, loop }] }),
        );
    },
    { key: LOOPS, loop: original },
  );
  await page.goto("/");
  await page.locator("#loops-open").click();
  await page.locator("#my-songs").click();
  await page.getByRole("button", { name: "NEW SONG" }).click();
  await page.getByLabel("Song name").fill("Sunrise");
  await page.getByLabel("Choose saved loop").selectOption("1");
  await page.getByRole("button", { name: "ADD SECTION" }).click();
  const box = page.getByLabel("Shared loop code or link");
  await box.fill("not a loop");
  await page.getByRole("button", { name: "IMPORT LOOP", exact: true }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "loop code or link" }),
  ).toBeVisible();
  await box.fill(
    loopLink(
      await encodeLoop({ ...original, name: "Hook" }),
      "https://example.org",
    ),
  );
  await page.getByRole("button", { name: "IMPORT LOOP", exact: true }).click();
  const second = page.getByRole("article", { name: "Section 2" });
  await second.getByRole("button", { name: "DUPLICATE" }).click();
  const ending = page.getByRole("article", { name: "Section 3" });
  await ending.getByRole("button", { name: "EDIT NOTES" }).click();
  await page.locator("#loop-name").fill("Ending");
  await page
    .getByRole("button", { name: "note 1 step 1", exact: true })
    .click();
  await page.getByRole("button", { name: "USE SECTION" }).click();
  await expect(ending).toContainText("Ending");
  await expect(second).toContainText("Hook");
  await ending.getByLabel("Plays").fill("2");
  await ending.getByLabel("Plays").press("Tab");
  await page.getByRole("button", { name: "Play from section 3" }).click();
  await page.getByRole("button", { name: "STOP", exact: false }).click();
  await page.getByRole("button", { name: "SAVE SONG" }).click();
  await expect(page.getByText("Song saved.")).toBeVisible();
  await page.getByRole("button", { name: "Play from section 3" }).click();
  await page.locator("#my-levels").click();
  await expect.poll(() => page.evaluate(() => window.songAudioCalls?.slice(-2))).toEqual(["suspend", "close"]);
  await page.reload();
  await page.locator("#loops-open").click();
  await page.locator("#my-songs").click();
  await expect(page.getByText("Sunrise", { exact: true })).toBeVisible();
  const { songs, loops } = await page.evaluate(
    ([a, b]) => ({
      songs: JSON.parse(localStorage.getItem(a)),
      loops: JSON.parse(localStorage.getItem(b)),
    }),
    [SONG_KEY, LOOPS],
  );
  expect(loops.loops[0].loop).toEqual(original);
  expect(
    songs.entries[0].song.sections.map((s) => [
      s.loop.name,
      s.repeats,
      s.loop.notes[0],
    ]),
  ).toEqual([
    ["Bassline", 1, []],
    ["Hook", 1, []],
    ["Ending", 2, [0]],
  ]);
});
