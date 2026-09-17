import { chromium } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { join, resolve, extname } from "node:path";
import { tmpdir } from "node:os";
import http from "node:http";

// Repeatable desktop smoke measurement, not a target-phone performance claim.
const baseline = "c00928c1c005aad711b752690881b9b5f332a089";
const scratch = await mkdtemp(join(tmpdir(), "clonedash-measure-"));
let server, browser;
try {
  execFileSync("tar", ["-x", "-C", scratch], {
    input: execFileSync("git", [
      "archive",
      baseline,
      "public",
      "scripts/build.mjs",
    ]),
  });
  execFileSync(process.execPath, ["scripts/build.mjs"], { cwd: scratch });
  let root;
  server = http.createServer(async (req, res) => {
    try {
      const path = new URL(req.url, "http://local").pathname;
      const file = resolve(root, "." + (path === "/" ? "/index.html" : path));
      if (!file.startsWith(root + "/")) throw Error("path");
      res.setHeader(
        "Content-Type",
        {
          ".html": "text/html",
          ".js": "text/javascript",
          ".css": "text/css",
          ".json": "application/json",
          ".svg": "image/svg+xml",
          ".png": "image/png",
        }[extname(file)] || "application/octet-stream",
      );
      res.end(await readFile(file));
    } catch {
      res.writeHead(404).end();
    }
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  browser = await chromium.launch();
  const results = [];
  for (const [name, dir] of [
    ["baseline", join(scratch, "dist")],
    ["candidate", resolve("dist")],
  ]) {
    root = dir;
    const context = await browser.newContext({
      viewport: { width: 932, height: 430 },
      serviceWorkers: "block",
    });
    await context.addInitScript(() => {
      localStorage.setItem(
        "clonedash.v1",
        JSON.stringify({
          version: 1,
          best: {},
          sound: false,
          draft: { name: "Measure", length: 100, objects: [] },
        }),
      );
      window.measure = {
        cost: [],
        interval: [],
        last: 0,
        playerY: null,
        inputAt: 0,
        response: null,
      };
      const raf = requestAnimationFrame;
      window.requestAnimationFrame = (callback) =>
        raf((time) => {
          const m = window.measure,
            start = performance.now();
          if (m.last) m.interval.push(time - m.last);
          m.last = time;
          callback(time);
          m.cost.push(performance.now() - start);
        });
      const fill = CanvasRenderingContext2D.prototype.fillRect;
      CanvasRenderingContext2D.prototype.fillRect = function (x, y, w, h) {
        if (this.fillStyle === "#9aff6b" && w === h && w > 20 && w < 60) {
          const m = window.measure,
            paintY = this.getTransform().f;
          if (
            m.inputAt &&
            !m.response &&
            m.playerY !== null &&
            paintY < m.playerY - 1
          )
            m.response = performance.now() - m.inputAt;
          m.playerY = paintY;
        }
        return fill.call(this, x, y, w, h);
      };
      window.addEventListener(
        "pointerdown",
        () => (window.measure.inputAt = performance.now()),
        true,
      );
    });
    const page = await context.newPage();
    const start = performance.now();
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    await page.locator("#play").waitFor();
    const readyMs = performance.now() - start;
    await page.locator("#editor-open").click();
    await page.locator("#test-level").click();
    await page.waitForTimeout(500);
    await page.evaluate(() => {
      window.measure.cost = [];
      window.measure.interval = [];
      window.measure.response = null;
      window.measure.inputAt = 0;
    });
    await page.mouse.click(500, 200);
    await page.waitForTimeout(1500);
    const result = await page.evaluate(() => {
      const m = window.measure,
        percentile = (values, p) =>
          values.sort((a, b) => a - b)[
            Math.min(values.length - 1, Math.floor(values.length * p))
          ];
      return {
        frames: m.cost.length,
        frameWorkP50: percentile(m.cost, 0.5),
        frameWorkP95: percentile(m.cost, 0.95),
        intervalP95: percentile(m.interval, 0.95),
        inputToPaintMs: m.response,
      };
    });
    results.push({ name, readyMs, ...result });
    await context.close();
  }
  console.log(
    JSON.stringify(
      {
        environment:
          "headless desktop Chromium, 932x430, silent empty 100-block custom level",
        baseline,
        results,
      },
      null,
      2,
    ),
  );
} finally {
  await browser?.close();
  if (server)
    await new Promise((r) => {
      server.close(r);
      server.closeAllConnections();
    });
  await rm(scratch, { recursive: true, force: true });
}
