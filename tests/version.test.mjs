import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { releaseIdentity } from "../scripts/version.mjs";

// Every fixture is a throwaway repository; git runs with signing and hooks off.
async function repository(name) {
  const root = await mkdtemp(join(tmpdir(), `clonedash-${name}-`));
  const git = (...args) => run(root, ...args);
  git("init", "-b", "main");
  git("config", "user.name", "Version test");
  git("config", "user.email", "test@example.invalid");
  return { root, git };
}
function run(cwd, ...args) {
  return execFileSync(
    "git",
    ["-c", "commit.gpgsign=false", "-c", "core.hooksPath=/dev/null", ...args],
    { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
  ).trim();
}
const REJECTED = /clean tree, complete history and a vMAJOR\.MINOR milestone/;

test("release milestones use first-parent anchors but count every intervening commit", async () => {
  const { root, git } = await repository("version");
  try {
    git("commit", "--allow-empty", "-m", "initial");
    // No milestone: release refuses, development still labels itself.
    assert.throws(() => releaseIdentity(root, true), REJECTED);
    assert.equal(releaseIdentity(root).anchor, null);
    assert.equal(releaseIdentity(root).version, "1.0.0-dev");
    // Control: the same tree with a milestone releases, so the refusal above
    // came from the missing anchor and not from the fixture.
    git("tag", "v1.0");
    assert.equal(releaseIdentity(root, true).version, "1.0.0");
    assert.equal(releaseIdentity(root).version, "1.0.0-dev");
    git("switch", "-c", "feature");
    git("commit", "--allow-empty", "-m", "feature");
    git("tag", "v99.0");
    git("switch", "main");
    git("commit", "--allow-empty", "-m", "main");
    git("merge", "--no-ff", "feature", "-m", "merge");
    assert.deepEqual(releaseIdentity(root, true), {
      version: "1.0.3",
      source: git("rev-parse", "HEAD"),
      dirty: false,
      anchor: "v1.0",
    });
    git("tag", "v1.1");
    git("tag", "v999.0.0");
    assert.equal(releaseIdentity(root, true).version, "1.1.0");
    assert.equal(releaseIdentity(root).version, "1.1.0-dev");
    await writeFile(join(root, "dirty"), "not a release");
    assert.throws(() => releaseIdentity(root, true), REJECTED);
    assert.equal(releaseIdentity(root).dirty, true);
    assert.equal(releaseIdentity(root).version, "1.1.0-dev");
    // Control: only the stray file changed, and removing it releases again.
    await rm(join(root, "dirty"));
    assert.equal(releaseIdentity(root, true).version, "1.1.0");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("a shallow clone cannot release even with a clean tree and a milestone on HEAD", async () => {
  const { root, git } = await repository("shallow-origin");
  const clones = await mkdtemp(join(tmpdir(), "clonedash-shallow-"));
  try {
    git("commit", "--allow-empty", "-m", "initial");
    git("commit", "--allow-empty", "-m", "milestone");
    git("tag", "v1.0");
    const origin = pathToFileURL(root).href;
    const shallow = join(clones, "shallow");
    run(clones, "clone", "--quiet", "--depth", "1", origin, "shallow");
    assert.equal(run(shallow, "rev-parse", "--is-shallow-repository"), "true");
    // Neither of the other two release conditions is violated here.
    const development = releaseIdentity(shallow);
    assert.equal(development.dirty, false);
    assert.equal(development.anchor, "v1.0");
    assert.equal(development.version, "1.0.0-dev");
    assert.throws(() => releaseIdentity(shallow, true), REJECTED);
    // Control one: a complete clone of the same origin releases.
    run(clones, "clone", "--quiet", origin, "complete");
    assert.equal(
      releaseIdentity(join(clones, "complete"), true).version,
      "1.0.0",
    );
    // Control two: the same directory releases once its history is complete.
    run(shallow, "fetch", "--quiet", "--unshallow");
    assert.equal(run(shallow, "rev-parse", "--is-shallow-repository"), "false");
    assert.equal(releaseIdentity(shallow, true).version, "1.0.0");
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(clones, { recursive: true, force: true });
  }
});

test("only vMAJOR.MINOR tags are milestones; look-alikes never satisfy a release", async () => {
  const { root, git } = await repository("anchors");
  try {
    git("commit", "--allow-empty", "-m", "initial");
    const lookalikes = [
      "v01.2", // leading zero, major
      "v1.02", // leading zero, minor
      "v1.2.3", // three components
      "v1.0.0",
      "v1", // one component
      "1.2", // no v
      "V3.4", // capital V (not V1.2: case-insensitive filesystems merge it with the control)
      "v1.2-rc1",
      "v1.2a",
      "v.1.2",
      "release-1.2",
    ];
    for (const tag of lookalikes) git("tag", tag);
    assert.deepEqual(
      git("tag", "--list").split("\n").sort(),
      [...lookalikes].sort(),
    );
    assert.throws(() => releaseIdentity(root, true), REJECTED);
    const development = releaseIdentity(root);
    assert.equal(development.anchor, null);
    assert.equal(development.dirty, false);
    assert.equal(development.version, "1.0.0-dev");
    // Control: one real milestone beside the same look-alikes releases and is
    // the anchor chosen, so the refusal above came from the tags alone.
    git("tag", "v1.2");
    assert.deepEqual(releaseIdentity(root, true), {
      version: "1.2.0",
      source: git("rev-parse", "HEAD"),
      dirty: false,
      anchor: "v1.2",
    });
    git("commit", "--allow-empty", "-m", "after");
    git("tag", "v1.3.0");
    git("tag", "v01.3");
    assert.equal(releaseIdentity(root, true).version, "1.2.1");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
