import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { RECORDINGS } from '../src/recordings.ts';
// Run after build. The emitted artifact, not the source template, is the contract.
test("artifact has one identity, a complete offline shell and the installed runtime licence", async () => {
  const version = JSON.parse(await readFile("dist/version.json", "utf8"));
  const html = await readFile("dist/index.html", "utf8");
  const worker = await readFile("dist/sw.js", "utf8");
  assert.match(version.build, /^[a-f0-9]{12}$/);
  assert.match(version.source, /^[a-f0-9]{40}$/);
  assert(html.includes(version.build));
  assert(worker.includes(version.build));
  assert(!worker.includes("__SHELL_ASSETS__"));
  const manifest = JSON.parse(
    await readFile("dist/.vite/manifest.json", "utf8"),
  );
  assert(html.includes(manifest["index.html"].file));
  assert(worker.includes(manifest["index.html"].file));
  for (const file of await readdir("dist/assets")) {
    assert(worker.includes("/assets/" + file), `not precached: ${file}`);
    if (file.endsWith(".js"))
      assert(
        (await readFile("dist/assets/" + file, "utf8")).includes("licenses.md"),
      );
  }
  const installed = (
    await readFile("node_modules/svelte/LICENSE.md", "utf8")
  ).trim();
  const shipped = await readFile("dist/licenses.md", "utf8");
  assert(
    shipped.includes(installed),
    "complete installed Svelte licence missing",
  );
  assert(
    shipped.includes(
      (await readFile("node_modules/qrcode/license", "utf8")).trim(),
    ),
    "complete installed QR licence missing",
  );
  assert.match(html, /rel="license"/);
  assert(worker.includes("/licenses.md"));
  const originalManifest = JSON.parse(
    await readFile("public/manifest.json", "utf8"),
  );
  assert.deepEqual(
    JSON.parse(await readFile("dist/manifest.json", "utf8")),
    originalManifest,
  );
  assert.match(
    await readFile("dist/_headers", "utf8"),
    /\/assets\/\*\s+Cache-Control: public, max-age=31536000, immutable/,
  );
});

test('all recordings and their attribution ship offline within a mobile download budget', async () => {
  const worker=await readFile('dist/sw.js','utf8');
  const credits=await readFile('dist/music/credits.html','utf8');
  assert.match(credits,/Of Far Different Nature/);
  assert.match(credits,/https:\/\/creativecommons.org\/licenses\/by\/4.0\//);
  assert.match(credits,/Changes:/);
  assert(worker.includes('/music/credits.html'));
  let bytes=0;
  for(const song of RECORDINGS) {
    const file=`/music/${song.file}.mp3`;
    const audio=await readFile(`dist${file}`); bytes+=audio.length;
    assert(audio.length>100000,`${song.name}: missing audio`);
    assert(worker.includes(file),`${song.name}: missing precache`);
    assert(credits.includes(song.name),`${song.name}: missing credit`);
  }
  assert(bytes<8*1024*1024,`recordings too large: ${bytes}`);
});
