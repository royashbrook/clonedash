import test from "node:test";
import assert from "node:assert/strict";
import {
  arrangement,
  duration,
  timeline,
  readSongs,
  writeSong,
  SONG_KEY,
} from "../src/arrangement.ts";
import { blankLoop, decodeLoop, encodeLoop, loopLink } from "../src/loop.ts";
import { decodeLevel, encodeLevel } from "../src/transfer.ts";
import { checkBackup, writeBackup } from "../src/backup.ts";
import { readSave } from "../src/library.ts";
import { emptyStore } from "../src/skin.ts";
const loop = { ...blankLoop(), name: "Intro" },
  part = { loop, repeats: 1 };
const song = {
  name: "Night drive",
  bpm: 120,
  sections: [part, { loop: { ...loop, name: "Chorus" }, repeats: 2 }],
};
const storage = () => {
  const m = new Map();
  return {
    getItem: (k) => m.get(k) ?? null,
    setItem: (k, v) => m.set(k, v),
    removeItem: (k) => m.delete(k),
  };
};
test("copied sections and imported loop links preserve the notes, with independent repeats and edits", async () => {
  const from = await decodeLoop(
    loopLink(await encodeLoop(loop), "https://example.org"),
  );
  const copy = arrangement({
    ...song,
    sections: [
      { loop: from, repeats: 1 },
      { loop: from, repeats: 2 },
    ],
  });
  copy.sections[1].loop.notes[0].push(12);
  assert.deepEqual(from.notes[0], []);
  assert.deepEqual(copy.sections[0].loop.notes[0], []);
  assert.deepEqual(
    timeline(copy).map((x) => x.section),
    [...Array(8).fill(0), ...Array(16).fill(1)],
  );
  assert.equal(timeline(copy)[16].step, 0);
  assert.equal(duration(copy), 6);
});
test("four minutes is inclusive, regardless of tempo; malformed repeats cannot grow a timeline", () => {
  const exact = arrangement({ ...song, sections: [{ loop, repeats: 120 }] });
  assert.equal(duration(exact), 240);
  assert.throws(() => arrangement({ ...exact, bpm: 119 }), /4:00/);
  assert.throws(
    () => arrangement({ ...song, sections: [{ loop, repeats: 1.5 }] }),
    /Repeat/,
  );
});
test("song levels transport a snapshot, only under their own format; levels without one keep their old format", async () => {
  const base = { name: "Trail", length: 40, objects: [] },
    withMusic = { ...base, arrangement: song, startMode: "door" };
  const code = await encodeLevel(withMusic);
  assert.match(code, /^cdl5\./);
  assert.deepEqual((await decodeLevel(code)).arrangement, song);
  await assert.rejects(() => decodeLevel(code.replace("cdl5", "cdl4")));
  const plain = await encodeLevel(base);
  assert.match(plain, /^cdl1\./);
  await assert.rejects(() => decodeLevel(plain.replace("cdl1", "cdl5")));
  await assert.rejects(() => encodeLevel({ ...withMusic, song: 1 }));
});
test("song library survives save transfer, restores old saves, and never overwrites unreadable data", () => {
  const s = storage();
  writeSong(s, null, song);
  const saved = readSongs(s.getItem(SONG_KEY));
  const base = { game: readSave(null, 23), skins: emptyStore() },
    backup = checkBackup({ v: 1, ...base, songs: saved }, 23);
  const other = storage();
  writeBackup(other, backup, 23);
  assert.deepEqual(readSongs(other.getItem(SONG_KEY)), saved);
  writeBackup(other, base, 23);
  assert.equal(other.getItem(SONG_KEY), null);
  other.setItem(SONG_KEY, "broken");
  assert.throws(() => writeSong(other, null, song));
  assert.equal(other.getItem(SONG_KEY), "broken");
});
