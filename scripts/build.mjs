import { build } from "vite";
import { readdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { releaseIdentity } from "./version.mjs";
const identity = releaseIdentity(
  process.cwd(),
  process.env.RELEASE_BUILD === "1",
);
async function files(root) {
  const entries = await readdir(root, { withFileTypes: true });
  return (
    await Promise.all(
      entries.map((e) =>
        e.isDirectory() ? files(`${root}/${e.name}`) : `${root}/${e.name}`,
      ),
    )
  )
    .flat()
    .sort();
}
const hash = createHash("sha256").update(JSON.stringify(identity));
for (const file of [
  ...(await files("src")),
  ...(await files("public")),
  "index.html",
  "package-lock.json",
  "vite.config.ts",
  "scripts/build.mjs",
  "scripts/version.mjs",
])
  hash.update(file).update(await readFile(file));
const id = hash.digest("hex").slice(0, 12);
process.env.CLONEDASH_BUILD = id;
process.env.CLONEDASH_VERSION = identity.version;
process.env.CLONEDASH_SOURCE = identity.source;
await build();
await writeFile(
  "dist/version.json",
  JSON.stringify({ ...identity, build: id }),
);
const assets = [
  "/",
  ...(await files("dist"))
    .filter((f) => !f.endsWith("/sw.js") && !f.endsWith("/_headers"))
    .map((f) => f.slice(4)),
];
const worker = await readFile("dist/sw.js", "utf8");
if (!worker.includes("__SHELL_ASSETS__"))
  throw Error("Missing worker precache marker");
const completeWorker = worker.replace(
  /(["'`])__SHELL_ASSETS__\1/,
  JSON.stringify(JSON.stringify(assets)),
);
if (completeWorker.includes("__SHELL_ASSETS__"))
  throw Error("Worker precache substitution failed");
await writeFile("dist/sw.js", completeWorker);
console.log(
  `Built Clone Dash ${identity.version} / ${id}; ${assets.length} precached paths`,
);
