import { readdir, readFile, writeFile, lstat } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { decodeLevel, MAX_CODE } from "../src/transfer.ts";
import { decodeSkin, isBlank } from "../src/skin.ts";
import { decodeLoop } from "../src/loop.ts";
import { arrangement } from "../src/arrangement.ts";

// Only data files with these paths qualify for a content release.
export const contentPath = /^(?:content\/levels\/challenger\/(\d{4})-[a-z0-9]+(?:-[a-z0-9]+)*\.cdl|content\/skins\/[a-z0-9]+(?:-[a-z0-9]+)*\.cds|content\/music\/loops\/[a-z0-9]+(?:-[a-z0-9]+)*\.cdm|content\/music\/songs\/[a-z0-9]+(?:-[a-z0-9]+)*\.(?:json|cdl))$/;

export async function readCatalog(root) {
  const out = { levels: [], skins: [], loops: [], songs: [] };
  async function visit(dir) {
    for (const name of (await readdir(join(root, dir))).sort()) {
      const rel = dir + "/" + name, path = join(root, rel), stat = await lstat(path);
      if (rel === "content/README.md" && stat.isFile()) continue;
      if (stat.isDirectory()) { await visit(rel); continue; }
      const match = contentPath.exec(rel);
      if (!match || !stat.isFile() || stat.size > MAX_CODE) throw Error("Invalid content file: " + rel);
      const raw = (await readFile(path, "utf8")).trim();
      try {
        if (match[1]) {
          if (Number(match[1]) !== 31 + out.levels.length) throw Error("Trail numbers must be consecutive starting at 0031");
          out.levels.push(await decodeLevel(raw));
        } else if (rel.startsWith("content/skins/")) {
          const skin = await decodeSkin(raw);
          if (isBlank(skin)) throw Error("A published skin needs a visible pixel");
          out.skins.push(skin);
        } else if (rel.startsWith("content/music/loops/")) out.loops.push(await decodeLoop(raw));
        else out.songs.push(arrangement(rel.endsWith(".cdl") ? (await decodeLevel(raw)).arrangement : JSON.parse(raw)));
      } catch (err) { throw Error(rel + ": " + err.message, { cause: err }); }
    }
  }
  await visit("content");
  return out;
}

export async function generate(root = process.cwd()) {
  const data = await readCatalog(root);
  await writeFile(join(root, "src/content.generated.json"), JSON.stringify(data) + "\n");
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await generate();
