import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { decodeSkin, encodeSkin, skinLink } from "../src/skin.ts";

test("100px skins keep every pixel; old codes stay byte-identical and old readers refuse a bigger skin", async (t) => {
  const dir = await mkdtemp(join(tmpdir(), "cube-small-skins-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  execFileSync("tar", ["-xf", "-", "-C", dir], { input: execFileSync("git", ["archive", "153f4a923e29a2e20e769a0ee1336be33329983e", "src"]) });
  const old = await import(join(dir, "src", "skin.ts"));
  for (const [w, h] of [[32, 32], [33, 4], [4, 100], [100, 4], [100, 100]]) {
    const skin = {
      name: "\u0000".repeat(40), width: w, height: h,
      palette: Array.from({length: 16}, (_, i) => `#12345${i.toString(16)}`),
      pixels: "0123456789abcdefg".repeat(Math.ceil(w * h / 17)).slice(0, w * h - 1) + "g",
    };
    const code = await encodeSkin(skin);
    assert.deepEqual(await decodeSkin(skinLink(code, "https://example.test/")), skin);
    assert.deepEqual(await decodeSkin("cds1.0" + Buffer.from(JSON.stringify(skin)).toString("base64url")), skin);
    if (w <= 32 && h <= 32) assert.equal(code, await old.encodeSkin(skin));
    else await assert.rejects(() => old.decodeSkin(code), /4 to 32|too large/);
  }
});
