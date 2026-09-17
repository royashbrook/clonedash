import { test, expect } from "@playwright/test";
import { build } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import http from "node:http";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { resolve, join, extname } from "node:path";
import { tmpdir } from "node:os";

test("unmount cancels frames, listeners and pending audio; remount owns exactly one run", async ({
  browser,
}) => {
  const scratch = await mkdtemp(join(tmpdir(), "clonedash-lifetime-"));
  let server, context;
  try {
    await build({
      configFile: false,
      root: resolve("tests/fixtures"),
      plugins: [svelte()],
      publicDir: false,
      logLevel: "error",
      define: {
        __APP_VERSION__: JSON.stringify("test"),
        __BUILD_ID__: JSON.stringify("test"),
        __SOURCE_SHA__: JSON.stringify("test"),
      },
      build: {
        outDir: scratch,
        emptyOutDir: true,
        rolldownOptions: { input: resolve("tests/fixtures/lifecycle.html") },
      },
    });
    server = http.createServer(async (req, res) => {
      try {
        const path = new URL(req.url, "http://local").pathname;
        const file = resolve(
          scratch,
          "." + (path === "/" ? "/lifecycle.html" : path),
        );
        if (!file.startsWith(scratch + "/")) throw Error("path");
        res.setHeader(
          "Content-Type",
          {
            ".html": "text/html",
            ".js": "text/javascript",
            ".css": "text/css",
          }[extname(file)] || "application/octet-stream",
        );
        res.end(await readFile(file));
      } catch {
        res.writeHead(404).end();
      }
    });
    await new Promise((r) => server.listen(0, "127.0.0.1", r));
    context = await browser.newContext({
      viewport: { width: 932, height: 430 },
    });
    await context.addInitScript(() => {
      window.pendingFrames = new Set();
      window.audioContexts = [];
      window.draws = 0;
      const raf = requestAnimationFrame,
        cancel = cancelAnimationFrame;
      window.requestAnimationFrame = (cb) => {
        let id = raf((time) => {
          window.pendingFrames.delete(id);
          cb(time);
        });
        window.pendingFrames.add(id);
        return id;
      };
      window.cancelAnimationFrame = (id) => {
        window.pendingFrames.delete(id);
        return cancel(id);
      };
      const fill = CanvasRenderingContext2D.prototype.fillRect;
      CanvasRenderingContext2D.prototype.fillRect = function (...args) {
        window.draws++;
        return fill.apply(this, args);
      };
      const Context = AudioContext;
      window.AudioContext = class extends Context {
        constructor(...args) {
          super(...args);
          window.audioContexts.push(this);
        }
      };
      window.audioStarted = 0;
      const start = AudioBufferSourceNode.prototype.start;
      AudioBufferSourceNode.prototype.start = function (...args) {
        if (this.loop) window.audioStarted++;
        return start.apply(this, args);
      };
      const render = OfflineAudioContext.prototype.startRendering;
      window.releaseRender = undefined;
      OfflineAudioContext.prototype.startRendering = async function () {
        const buffer = await render.call(this);
        await new Promise((resolve) => {
          window.releaseRender = resolve;
        });
        return buffer;
      };
    });
    const page = await context.newPage(),
      errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    await page.evaluate(() => window.mountGame());
    await page.locator("#sound").click();
    await expect
      .poll(() => page.evaluate(() => typeof window.releaseRender))
      .toBe("function");
    await page.evaluate(() => window.unmountGame());
    await page.evaluate(() => window.releaseRender());
    await expect
      .poll(() => page.evaluate(() => window.pendingFrames.size))
      .toBe(0);
    await expect
      .poll(() =>
        page.evaluate(() =>
          window.audioContexts.every((c) => c.state === "closed"),
        ),
      )
      .toBe(true);
    expect(await page.evaluate(() => window.audioStarted)).toBe(0);
    const draws = await page.evaluate(() => window.draws);
    await page.keyboard.press("Space");
    await page.evaluate(() => window.dispatchEvent(new Event("resize")));
    await page.waitForTimeout(100);
    expect(await page.evaluate(() => window.draws)).toBe(draws);
    await page.evaluate(() => {
      localStorage.clear();
      window.mountGame();
    });
    await page.locator("#play").click();
    await page.locator("#pause").click();
    await expect(
      page.getByRole("heading", { name: "Paused", exact: true }),
    ).toBeVisible();
    await expect(page.locator("#world")).toHaveCount(1);
    expect(await page.evaluate(() => window.pendingFrames.size)).toBe(1);
    await page.evaluate(() => window.unmountGame());
    expect(await page.evaluate(() => window.pendingFrames.size)).toBe(0);
    expect(errors).toEqual([]);
  } finally {
    await context?.close();
    if (server)
      await new Promise((r) => {
        server.close(r);
        server.closeAllConnections();
      });
    await rm(scratch, { recursive: true, force: true });
  }
});
