import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { releaseIdentity } from "../scripts/version.mjs";

test("release milestones use first-parent anchors but count every intervening commit", async () => {
  const root = await mkdtemp(join(tmpdir(), "clonedash-version-"));
  const git = (...args) =>
    execFileSync(
      "git",
      ["-c", "commit.gpgsign=false", "-c", "core.hooksPath=/dev/null", ...args],
      { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
    ).trim();
  try {
    git("init", "-b", "main");
    git("config", "user.name", "Version test");
    git("config", "user.email", "test@example.invalid");
    git("commit", "--allow-empty", "-m", "initial");
    assert.throws(() => releaseIdentity(root, true), /milestone/);
    assert.match(releaseIdentity(root).version, /-dev$/);
    git("tag", "v1.0");
    assert.equal(releaseIdentity(root, true).version, "1.0.0");
    git("switch", "-c", "feature");
    git("commit", "--allow-empty", "-m", "feature");
    git("tag", "v99.0");
    git("switch", "main");
    git("commit", "--allow-empty", "-m", "main");
    git("merge", "--no-ff", "feature", "-m", "merge");
    assert.equal(releaseIdentity(root, true).version, "1.0.3");
    git("tag", "v1.1");
    git("tag", "v999.0.0");
    assert.equal(releaseIdentity(root, true).version, "1.1.0");
    await writeFile(join(root, "dirty"), "not a release");
    assert.throws(() => releaseIdentity(root, true), /clean tree/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
