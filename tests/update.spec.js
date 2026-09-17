import { test, expect } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, extname } from "node:path";
import http from "node:http";
import { releaseIdentity } from "../scripts/version.mjs";

const baseline = "c00928c1c005aad711b752690881b9b5f332a089";
const types = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
};
async function origin(root) {
  let folder = root,
    unavailable = false,
    variant = false,
    deny = "";
  const server = http.createServer(async (req, res) => {
    const path = new URL(req.url, "http://local").pathname;
    if (unavailable) return req.socket.destroy();
    if (deny && path === deny) return res.writeHead(503).end();
    // The production asset host canonicalizes index.html. Cache.addAll follows it,
    // but that redirected response cannot answer a manual-redirect navigation.
    if (path === "/index.html")
      return res.writeHead(308, { Location: "/" }).end();
    const file = resolve(folder, "." + (path === "/" ? "/index.html" : path));
    if (!file.startsWith(folder + "/")) return res.writeHead(403).end();
    try {
      let bytes = await readFile(file);
      // A second complete release of identical code; only the served identity changes.
      if (variant && [".html", ".js", ".json"].includes(extname(file))) {
        const { build } = JSON.parse(
          await readFile(join(folder, "version.json"), "utf8"),
        );
        bytes = Buffer.from(bytes.toString().replaceAll(build, "fedcba987654"));
      }
      res
        .writeHead(200, {
          "Content-Type": types[extname(file)] || "application/octet-stream",
          "Cache-Control": "no-store",
        })
        .end(bytes);
    } catch {
      res.writeHead(404).end();
    }
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  return {
    url: `http://127.0.0.1:${server.address().port}/`,
    switchTo: (next) => (folder = next),
    nextBuild: () => (variant = true),
    deny: (path) => (deny = path),
    offline: () => (unavailable = true),
    close: () =>
      new Promise((r) => {
        server.close(r);
        server.closeAllConnections();
      }),
  };
}

test("canonical index redirect still permits a controlled offline navigation", async ({
  browser,
}) => {
  const server = await origin(resolve("dist"));
  const context = await browser.newContext();
  try {
    const page = await context.newPage();
    await page.goto(server.url);
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.waitForFunction(() => !!navigator.serviceWorker.controller);
    const { build } = JSON.parse(await readFile("dist/version.json", "utf8"));
    const responses = await page.evaluate(async (key) => {
      const cache = await caches.open(key);
      const root = await cache.match("/");
      const index = await cache.match("/index.html");
      return { root: root?.redirected, index: index?.redirected };
    }, `clonedash-${build}`);
    expect(responses).toEqual({ root: false, index: true });
    // Disconnect the actual origin. WebKit's setOffline/reload also fails with
    // a control worker returning synthetic HTML without any network dependency.
    server.offline();
    await page.reload();
    await expect(page.locator("#play")).toBeVisible();
    await page.locator("#play").click();
    await expect(page.locator("#hud")).toBeVisible();
  } finally {
    await context.close();
    await server.close();
  }
});

test("the waiting fix repairs only the shipped redirected snapshot without taking consent or changing saves", async ({
  browser,
}) => {
  const scratch = await mkdtemp(
    join(tmpdir(), "clonedash-redirected-release-"),
  );
  let server, context;
  try {
    // Transfer only the tagged release's ancestry. A shared clone also inherits
    // shallow metadata for unrelated synthetic PR heads, even when this history is complete.
    // The SHA, identity, full-history guard and rebuilt fingerprint stay pinned below.
    execFileSync(
      "git",
      [
        "clone", "--no-local", "--single-branch", "--branch", "v0.7",
        "--no-checkout", process.cwd(), scratch,
      ],
      { stdio: "pipe" },
    );
    execFileSync(
      "git",
      [
        "-C",
        scratch,
        "checkout",
        "--detach",
        "1fd9f6c3b63be2b9b2519373ff812768996500a7",
      ],
      { stdio: "pipe" },
    );
    await symlink(
      resolve("node_modules"),
      join(scratch, "node_modules"),
      "dir",
    );
    // node_modules/ ignores a directory, not this fixture's dependency symlink.
    await writeFile(join(scratch, ".git/info/exclude"), "\n/node_modules\n", {
      flag: "a",
    });
    expect(
      execFileSync("git", ["-C", scratch, "status", "--porcelain"], {
        encoding: "utf8",
      }),
    ).toBe("");
    expect(releaseIdentity(scratch)).toEqual({
      version: "0.7.0-dev",
      source: "1fd9f6c3b63be2b9b2519373ff812768996500a7",
      dirty: false,
      anchor: "v0.7",
    });
    expect(execFileSync("git", ["-C", scratch, "rev-parse", "--is-shallow-repository"], { encoding: "utf8" }).trim()).toBe("false");
    execFileSync(process.execPath, ["scripts/build.mjs"], {
      cwd: scratch,
      env: { ...process.env, RELEASE_BUILD: "1" },
      stdio: "pipe",
    });
    const old = JSON.parse(
      await readFile(join(scratch, "dist/version.json"), "utf8"),
    );
    expect(old.build).toBe("be732b0ddab2");
    server = await origin(join(scratch, "dist"));
    context = await browser.newContext({
      viewport: { width: 932, height: 430 },
    });
    const page = await context.newPage();
    await page.goto(server.url);
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.waitForFunction(() => !!navigator.serviceWorker.controller);
    await page.locator("#my-levels").click();
    await page.locator("#new-level").click();
    await page.locator("#level-title").fill("Survives redirect repair");
    await page.locator("#level-title").blur();
    const saved = await page.evaluate(() =>
      localStorage.getItem("clonedash.v1"),
    );
    const rootBody = await page.evaluate(async () => {
      const cache = await caches.open("clonedash-be732b0ddab2");
      return (await cache.match("/")).text();
    });
    // An unrelated cache must not be rewritten by the repair.
    await page.evaluate(async () => {
      const cache = await caches.open("unrelated-app");
      await cache.put("/index.html", new Response("leave me alone"));
    });
    const failed = await context.newPage();
    const failure = await failed.goto(server.url).catch((error) => error);
    expect(failure).toBeInstanceOf(Error);
    await failed.close();
    server.switchTo(resolve("dist"));
    await page.evaluate(async () =>
      (await navigator.serviceWorker.getRegistration()).update(),
    );
    await expect
      .poll(() =>
        page.evaluate(
          async () =>
            !!(await navigator.serviceWorker.getRegistration()).waiting,
        ),
      )
      .toBe(true);
    expect(await page.locator("meta[name=build]").getAttribute("content")).toBe(
      old.build,
    );
    const repaired = await page.evaluate(async () => {
      const cache = await caches.open("clonedash-be732b0ddab2");
      const index = await cache.match("/index.html");
      return {
        redirected: index.redirected,
        body: await index.text(),
        other: await (
          await (await caches.open("unrelated-app")).match("/index.html")
        ).text(),
      };
    });
    expect(repaired).toEqual({
      redirected: false,
      body: rootBody,
      other: "leave me alone",
    });
    // The OLD active worker can navigate again. No forced activation or reload.
    await page.reload();
    await expect(page.locator(".version")).toHaveText("v0.7.0");
    expect(
      await page.evaluate(() => localStorage.getItem("clonedash.v1")),
    ).toBe(saved);
    await page.evaluate(() =>
      document.dispatchEvent(new Event("visibilitychange")),
    );
    await expect(page.locator("#update")).toBeVisible();
    await page.locator("#update").click();
    const current = JSON.parse(await readFile("dist/version.json", "utf8"));
    await expect(page.locator("meta[name=build]")).toHaveAttribute(
      "content",
      current.build,
    );
    expect(
      await page.evaluate(() => localStorage.getItem("clonedash.v1")),
    ).toBe(saved);
    server.offline();
    await page.reload();
    await page.locator("#my-levels").click();
    await page
      .getByRole("button", {
        name: "Edit Survives redirect repair",
        exact: true,
      })
      .click();
    await page.locator("#test-level").click();
    await expect(page.locator("#hud")).toBeVisible();
  } finally {
    await context?.close();
    await server?.close();
    await rm(scratch, { recursive: true, force: true });
  }
});

test("installed legacy build updates to Svelte without replacing saved work; offline editor and play survive", async ({
  browser,
}) => {
  const scratch = await mkdtemp(join(tmpdir(), "clonedash-upgrade-"));
  let server, context;
  try {
    const archive = execFileSync("git", [
      "archive",
      baseline,
      "public",
      "scripts/build.mjs",
    ]);
    execFileSync("tar", ["-x", "-C", scratch], { input: archive });
    execFileSync(process.execPath, ["scripts/build.mjs"], { cwd: scratch });
    server = await origin(join(scratch, "dist"));
    context = await browser.newContext({
      viewport: { width: 932, height: 430 },
    });
    const page = await context.newPage();
    await page.goto(server.url);
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.reload();
    await page.waitForFunction(() => !!navigator.serviceWorker.controller);
    const oldBuild = await page
      .locator("meta[name=build]")
      .getAttribute("content");
    await page.locator("#my-levels").click();
    await page.locator("#new-level").click();
    await page.locator("#level-title").fill("Before the rebuild");
    await page.locator("#level-title").blur();
    await page.locator("#level-length").fill("20");
    await page.locator("#level-length").blur();
    const saved = await page.evaluate(() =>
      localStorage.getItem("clonedash.v1"),
    );
    server.switchTo(resolve("dist"));
    await page.evaluate(() =>
      document.dispatchEvent(new Event("visibilitychange")),
    );
    await expect(page.locator("#update")).toBeVisible();
    expect(await page.locator("meta[name=build]").getAttribute("content")).toBe(
      oldBuild,
    );
    await page.locator("#update").click();
    await expect(page.locator("meta[name=build]")).not.toHaveAttribute(
      "content",
      oldBuild,
    );
    // No test-issued ACTIVATE: the real new shell must finish the legacy updater's reload.
    await expect
      .poll(() =>
        page.evaluate(async () => {
          const reg = await navigator.serviceWorker.getRegistration();
          return !!reg?.active && !reg.waiting && !reg.installing;
        }),
      )
      .toBe(true);
    const current = JSON.parse(await readFile("dist/version.json", "utf8"));
    await expect
      .poll(() => page.evaluate(() => caches.keys()))
      .toContain(`clonedash-${current.build}`);
    expect(
      await page.evaluate(() => localStorage.getItem("clonedash.v1")),
    ).toBe(saved);
    await page.locator("#my-levels").click();
    await expect(
      page.getByRole("button", {
        name: "Edit Before the rebuild",
        exact: true,
      }),
    ).toBeVisible();
    server.offline();
    await page.reload();
    await page.locator("#my-levels").click();
    await page
      .getByRole("button", { name: "Edit Before the rebuild", exact: true })
      .click();
    await expect(page.locator("#level-length")).toHaveValue("20");
    await page.locator("#test-level").click();
    await expect(page.locator("#hud")).toBeVisible();
    expect(
      await page.evaluate(() => localStorage.getItem("clonedash.v1")),
    ).toBe(saved);
  } finally {
    await context?.close();
    await server?.close();
    await rm(scratch, { recursive: true, force: true });
  }
});

test("candidate download failure keeps the current build; consent installs a full snapshot, then cleans old caches", async ({
  browser,
}) => {
  const server = await origin(resolve("dist"));
  const context = await browser.newContext({
    viewport: { width: 932, height: 430 },
  });
  try {
    const page = await context.newPage();
    await page.goto(server.url);
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.reload();
    await page.waitForFunction(() => !!navigator.serviceWorker.controller);
    const oldBuild = await page
      .locator("meta[name=build]")
      .getAttribute("content");
    const manifest = JSON.parse(
      await readFile("dist/.vite/manifest.json", "utf8"),
    );
    const other = await context.newPage();
    await other.goto(server.url);
    server.nextBuild();
    server.deny("/" + manifest["index.html"].file);
    await page.evaluate(() =>
      document.dispatchEvent(new Event("visibilitychange")),
    );
    await expect(page.locator("#update")).toBeVisible();
    await page.locator("#update").click();
    await expect(page.locator("#notice")).toContainText("could not download", {
      timeout: 15000,
    });
    await expect(page.locator("meta[name=build]")).toHaveAttribute(
      "content",
      oldBuild,
    );
    await page.locator("#play").click();
    await expect(page.locator("#hud")).toBeVisible();
    await page.locator("#pause").click();
    server.deny("");
    await page.locator("#update").click();
    await expect(page.locator("meta[name=build]")).toHaveAttribute(
      "content",
      "fedcba987654",
      // apply() has a 10s download deadline followed by 8s for activation.
      // A 5s test deadline could fail before either app deadline had fired.
      { timeout: 20000 },
    );
    // The untouched tab still runs the old module; don't collect its cache under it.
    await expect(other.locator("meta[name=build]")).toHaveAttribute(
      "content",
      oldBuild,
    );
    expect(await page.evaluate(() => caches.keys())).toContain(
      `clonedash-${oldBuild}`,
    );
    await other.close();
    await page.evaluate(() =>
      document.dispatchEvent(new Event("visibilitychange")),
    );
    await expect
      .poll(() => page.evaluate(() => caches.keys()))
      .toEqual(["clonedash-fedcba987654"]);
    server.offline();
    await page.reload();
    await expect(page.locator(".level-card")).toHaveCount(9);
    await expect(page.locator("meta[name=build]")).toHaveAttribute(
      "content",
      "fedcba987654",
    );
  } finally {
    await context.close();
    await server.close();
  }
});
