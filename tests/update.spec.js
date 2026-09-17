import { test, expect } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, extname } from "node:path";
import http from "node:http";

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
    if (unavailable || (deny && path === deny)) return res.writeHead(503).end();
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
