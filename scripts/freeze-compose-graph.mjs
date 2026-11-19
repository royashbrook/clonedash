// Freezes compose's graph/schedule/buffer-input hash for every synthesized song into
// tests/fixtures/compose-graph.json (#121). Run once on the baseline commit before the voices move
// out of music.ts; tests/compose-graph.test.mjs then holds every later commit to it.
//   node --experimental-strip-types scripts/freeze-compose-graph.mjs
import { writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { compose, TRACKS } from "../src/music.ts";
import { graphOf } from "../tests/audio-graph.mjs";

const songs = {};
for (let index = 0; index < TRACKS.length + 100; index++) songs[index] = (await graphOf(compose, index)).hash;
const source = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
  music = execFileSync("git", ["rev-parse", "HEAD:src/music.ts"], { encoding: "utf8" }).trim(),
  dirty = execFileSync("git", ["status", "--porcelain", "--", "src"], { encoding: "utf8" }).trim();
if (dirty) throw Error(`src has uncommitted changes, so this is not a baseline:\n${dirty}`);
await writeFile(
  "tests/fixtures/compose-graph.json",
  JSON.stringify({ frozenFrom: source, musicBlob: music, songs }, null, 1) + "\n",
);
console.log(`froze ${Object.keys(songs).length} songs from ${source} (music.ts ${music})`);
