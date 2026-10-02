import { mkdtemp, cp, readFile, writeFile, rm } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import assert from "node:assert/strict";

const dir = await mkdtemp(join(tmpdir(), "clonedash-mutants-"));
try {
  await cp("src", join(dir, "src"), { recursive: true });
  await cp("scripts/version.mjs", join(dir, "scripts", "version.mjs"));
  // Keep relative imports valid, and run git reads from the real repository below.
  for (const testFile of [
    "migration.test.mjs",
    "transfer.test.mjs",
    "courses.test.mjs",
    "course-input.mjs",
    "remix-inputs.mjs",
    "version.test.mjs",
    "pogo.test.mjs",
  ]) {
    const testSource = (await readFile(join("tests", testFile), "utf8"))
      .replaceAll("../src/", "./src/")
      .replaceAll("../scripts/", "./scripts/");
    await writeFile(join(dir, testFile), testSource);
  }
  const run = (pattern, testFile) =>
    spawnSync(
      process.execPath,
      [
        "--experimental-strip-types",
        "--test",
        `--test-name-pattern=${pattern}`,
        join(dir, testFile),
      ],
      { encoding: "utf8" },
    );
  for (const [file, from, to, pattern, testFile = "migration.test.mjs"] of [
    ["engine.ts", "SPEED = 5,", "SPEED = 5.1,", "typed engine matches"],
    [
      "render.ts",
      "h - Math.max(42, h * 0.16)",
      "h - Math.max(42, h * 0.18)",
      "drawing commands match",
    ],
    [
      "engine.ts",
      "Math.min(...bb) + 0.00001",
      "Math.min(...bb) + 0.0001",
      "contact, ramp span and ceiling tolerances",
    ],
    [
      "engine.ts",
      "hi <= lo + 0.00001",
      "hi <= lo + 0.0001",
      "contact, ramp span and ceiling tolerances",
    ],
    [
      "engine.ts",
      "bounds(o).top > height + 0.00001",
      "bounds(o).top > height + 0.01",
      "contact, ramp span and ceiling tolerances",
    ],
    [
      "engine.ts",
      "const level = structuredClone(raw);",
      "const level = raw;",
      "isolated from the object it was built from",
    ],
    [
      "transfer.ts",
      "size > MAX_LEVEL_BYTES",
      "size > MAX_LEVEL_BYTES * 100",
      "inflation stops and cancels",
      "transfer.test.mjs",
    ],
    [
      "transfer.ts",
      "text.length > MAX_CODE",
      "text.length > MAX_CODE * 100",
      "encoded bound rejects",
      "transfer.test.mjs",
    ],
    [
      "transfer.ts",
      "storage.getItem(SAVE) ?? JSON.stringify(fallback)",
      "JSON.stringify(fallback)",
      "confirmation rereads storage",
      "transfer.test.mjs",
    ],
    [
      "transfer.ts",
      "...structuredClone(save.customLevels),",
      "",
      "import appends independently",
      "transfer.test.mjs",
    ],
    ["transfer.ts", "if (openInEditor) selectLevel", "if (false) selectLevel", "copy re-reads", "courses.test.mjs"],
    // The legacy id migration has to reach the save, not only the validator's return value.
    ["library.ts", "s.draft = validateLevel(s.draft);", "validateLevel(s.draft);", "readSave loads a jumper save", "pogo.test.mjs"],
    ["levels.ts", "LEVELS.push(...COURSES)", "LEVELS.unshift(...COURSES)", "groups preserve", "courses.test.mjs"],
    ["levels.ts", "LEVELS.push(...REMIX)", "LEVELS.unshift(...REMIX)", "groups preserve", "courses.test.mjs"],
    ["courses.ts", "song: 109", "song: 110", "groups preserve", "courses.test.mjs"],
    // Release identity guards: each rejection must fail against its broken control.
    [
      "scripts/version.mjs",
      "dirty || shallow || !anchor",
      "dirty || !anchor",
      "shallow clone cannot release",
      "version.test.mjs",
    ],
    [
      "scripts/version.mjs",
      "dirty || shallow || !anchor",
      "shallow || !anchor",
      "first-parent anchors",
      "version.test.mjs",
    ],
    [
      "scripts/version.mjs",
      "/^v(0|[1-9]\\d*)\\.(0|[1-9]\\d*)$/",
      "/^v\\d+\\.\\d+(\\.\\d+)?$/",
      "look-alikes never satisfy",
      "version.test.mjs",
    ],
  ]) {
    const path = join(dir, file.includes("/") ? file : join("src", file)),
      original = await readFile(path, "utf8");
    assert(original.includes(from), `mutant target moved: ${file}`);
    let result = run(pattern, testFile);
    assert.equal(result.status, 0, result.stderr + result.stdout);
    await writeFile(path, original.replace(from, to));
    result = run(pattern, testFile);
    assert.equal(
      result.status,
      1,
      `mutant survived: ${file}\n${result.stdout}`,
    );
    assert.match(
      result.stdout,
      /AssertionError|ERR_ASSERTION/,
      "mutation must fail the oracle, not module loading",
    );
    await writeFile(path, original);
    console.log(`caught ${file}: ${from} -> ${to}`);
  }
} finally {
  await rm(dir, { recursive: true, force: true });
}
