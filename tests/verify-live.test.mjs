import test from "node:test";
import assert from "node:assert/strict";
import { inspectLive, verifyLive, NOTICES } from "../scripts/verify-live.mjs";

const ORIGIN = "https://game.example.invalid";
const release = {
  version: "1.2.3",
  source: "a".repeat(40),
  build: "0123456789ab",
  dirty: false,
  anchor: "v1.2",
};
// A served site, keyed by path. Each entry is a status and a body.
function site(identity = release) {
  return {
    "/version.json": [200, JSON.stringify(identity)],
    "/": [
      200,
      `<html><meta name="build" content="${identity.build}" /></html>`,
    ],
    "/sw.js": [200, `var t=\`clonedash-${identity.build}\`;`],
    "/licenses.md": [200, "# licences"],
    "/music/credits.html": [200, "<html>credits</html>"],
  };
}
function fetcher(pages) {
  const calls = [];
  const fetchImpl = async (url) => {
    const path = new URL(url).pathname;
    calls.push(path);
    const page = pages[path];
    if (page instanceof Error) throw page;
    const [status, body] = page || [404, "not found"];
    return {
      ok: status >= 200 && status < 300,
      status,
      text: async () => body,
    };
  };
  return { fetchImpl, calls };
}
const fast = { tries: 3, delay: 1, sleep: async () => {} };

test("a live site serving the validated release passes on the first look", async () => {
  const { fetchImpl, calls } = fetcher(site());
  assert.deepEqual(await inspectLive(ORIGIN, release, fetchImpl), []);
  assert.deepEqual(calls, ["/version.json", "/", "/sw.js", ...NOTICES]);
  calls.length = 0;
  const receipt = await verifyLive(ORIGIN, release, { ...fast, fetchImpl });
  assert.equal(receipt.attempts, 1);
  assert.equal(receipt.source, release.source);
  assert.deepEqual(calls, ["/version.json", "/", "/sw.js", ...NOTICES]);
});

test("every mismatch is named and each one fails the release after bounded tries", async () => {
  const stale = { ...release, source: "b".repeat(40), build: "ba9876543210" };
  const breaks = {
    "/version.json": [
      [200, JSON.stringify(stale)],
      [/source: served b{40}, expected a{40}/, /build: served ba9876543210/],
    ],
    "/": [
      [200, `<meta name="build" content="${stale.build}" />`],
      [/\/: shell does not carry build 0123456789ab/],
    ],
    "/sw.js": [
      [200, `var t=\`clonedash-${stale.build}\`;`],
      [/\/sw.js: worker does not carry build 0123456789ab/],
    ],
    "/licenses.md": [[404, ""], [/\/licenses.md: HTTP 404/]],
    "/music/credits.html": [[500, ""], [/\/music\/credits.html: HTTP 500/]],
  };
  for (const [path, [page, patterns]] of Object.entries(breaks)) {
    const pages = { ...site(), [path]: page };
    const problems = await inspectLive(
      ORIGIN,
      release,
      fetcher(pages).fetchImpl,
    );
    for (const pattern of patterns)
      assert.ok(
        problems.some((p) => pattern.test(p)),
        `${path}: ${problems}`,
      );
    const sleeps = [];
    const { fetchImpl, calls } = fetcher(pages);
    await assert.rejects(
      verifyLive(ORIGIN, release, {
        ...fast,
        fetchImpl,
        sleep: async (ms) => sleeps.push(ms),
      }),
      (error) =>
        /does not match the validated build after 3 tries/.test(
          error.message,
        ) && patterns.every((pattern) => pattern.test(error.message)),
    );
    assert.deepEqual(sleeps, [1, 1], path);
    assert.equal(calls.filter((c) => c === "/version.json").length, 3, path);
  }
});

test("control: the same stale site passes when it is the expected release", async () => {
  // Proves the rejections above come from the comparison, not the fixture.
  const stale = { ...release, source: "b".repeat(40), build: "ba9876543210" };
  const { fetchImpl } = fetcher(site(stale));
  await assert.rejects(verifyLive(ORIGIN, release, { ...fast, fetchImpl }));
  assert.deepEqual(await inspectLive(ORIGIN, stale, fetchImpl), []);
  const receipt = await verifyLive(ORIGIN, stale, { ...fast, fetchImpl });
  assert.equal(receipt.build, stale.build);
});

test("a release that propagates during the retry window passes with the attempt recorded", async () => {
  const stale = { ...release, source: "b".repeat(40), build: "ba9876543210" };
  let looks = 0;
  const old = fetcher(site(stale)).fetchImpl;
  const fresh = fetcher(site()).fetchImpl;
  const failing = fetcher({ "/version.json": new TypeError("fetch failed") });
  const fetchImpl = (url, init) => {
    if (new URL(url).pathname === "/version.json") looks++;
    return (looks <= 1 ? failing.fetchImpl : looks <= 2 ? old : fresh)(
      url,
      init,
    );
  };
  const log = [];
  const receipt = await verifyLive(ORIGIN, release, {
    ...fast,
    fetchImpl,
    log: (line) => log.push(line),
  });
  assert.equal(receipt.attempts, 3);
  assert.match(log[0], /attempt 1 of 3: \/version.json: fetch failed/);
  assert.match(log[1], /attempt 2 of 3: \/version.json source/);
  assert.equal(log.length, 2);
  // Control: with one try fewer the same propagation is a failure.
  looks = 0;
  await assert.rejects(
    verifyLive(ORIGIN, release, { ...fast, tries: 2, fetchImpl }),
    /after 2 tries/,
  );
});
