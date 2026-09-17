import { test, expect } from "@playwright/test";
import jsQR from "jsqr";
import http from "node:http";
import { readFile } from "node:fs/promises";
import { resolve, extname } from "node:path";
import { encodeLevel, decodeLevel, MAX_CODE } from "../src/transfer.ts";
import { object } from "../src/engine.ts";
import { readSave, newLevel } from "../src/library.ts";

const source = {
  name: "Sky workshop",
  length: 80,
  height: 20,
  objects: [
    object("jumper", 5, 0),
    {
      ...object("grid", 8.05, 12.05),
      rotation: 90,
      flipX: true,
      layer: "background",
    },
    object("ring", 10, 8),
  ],
};
const sourceSave = {
  version: 1,
  sound: false,
  best: { 0: 100 },
  draft: source,
  activeLevel: 6,
  customLevels: [{ id: 6, level: source }],
};
const portable = { ...source, song: 14 };
const stored = (page) =>
  page.evaluate(() => localStorage.getItem("clonedash.v1"));
async function seed(page, save = sourceSave, url = "/") {
  await page.addInitScript((save) => {
    if (!localStorage.getItem("clonedash.v1"))
      localStorage.setItem("clonedash.v1", JSON.stringify(save));
    Object.defineProperty(navigator, "share", {
      configurable: true,
      value: async (data) => {
        window.sentLevel = {
          ...data,
          files:
            data.files && (await Promise.all(data.files.map((f) => f.text()))),
        };
        if (window.cancelShare)
          throw new DOMException("Cancelled", "AbortError");
      },
    });
    Object.defineProperty(navigator, "canShare", {
      configurable: true,
      value: () => true,
    });
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: async (text) => {
          if (window.denyClipboard) throw Error("denied");
          window.copiedLevel = text;
        },
      },
    });
  }, save);
  await page.goto(url);
}
async function offlineOrigin() {
  const root = resolve("dist"),
    types = {
      ".html": "text/html",
      ".js": "text/javascript",
      ".css": "text/css",
      ".json": "application/json",
      ".svg": "image/svg+xml",
      ".png": "image/png",
    };
  const server = http.createServer(async (req, res) => {
    const path = new URL(req.url, "http://local").pathname;
    const file = resolve(root, "." + (path === "/" ? "/index.html" : path));
    if (!file.startsWith(root + "/")) return res.writeHead(403).end();
    try {
      res
        .writeHead(200, {
          "Content-Type": types[extname(file)] || "text/plain",
        })
        .end(await readFile(file));
    } catch {
      res.writeHead(404).end();
    }
  });
  await new Promise((done) => server.listen(0, "127.0.0.1", done));
  return {
    url: `http://127.0.0.1:${server.address().port}/`,
    close: () =>
      new Promise((done) => {
        server.close(done);
        server.closeAllConnections();
      }),
  };
}
async function openImport(page) {
  await page.locator("#my-levels").click();
  await page.locator("#import-level").click();
}
async function preview(page, code) {
  await page.locator("#import-code").fill(code);
  await page.locator("#preview-level").click();
  await expect(page.locator("#add-level")).toBeVisible();
}

test("native share and a real decoded QR preview one level on a second device without replacing its library", async ({
  page,
  browser,
}) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await seed(page);
  const original = await stored(page);
  await page.locator("#my-levels").click();
  await page
    .getByRole("button", { name: "Share Sky workshop", exact: true })
    .click();
  await page.locator("#send-level").click();
  const shared = await page.evaluate(() => window.sentLevel);
  expect(new URL(shared.url).search).toBe("");
  expect(await decodeLevel(shared.url)).toEqual(portable);
  const pixels = await page.locator(".level-qr").evaluate((image) => {
    const canvas = document.createElement("canvas");
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(image, 0, 0);
    return {
      width: canvas.width,
      height: canvas.height,
      data: [...ctx.getImageData(0, 0, canvas.width, canvas.height).data],
    };
  });
  const decoded = jsQR(
    new Uint8ClampedArray(pixels.data),
    pixels.width,
    pixels.height,
  );
  expect(decoded?.data).toBe(shared.url);
  expect(await stored(page)).toBe(original);

  const context = await browser.newContext({
    baseURL: new URL(page.url()).origin,
    viewport: { width: 430, height: 932 },
  });
  try {
    const receiver = await context.newPage();
    const existing = readSave(null, 9);
    existing.best = { 0: 100, 1: 63 };
    newLevel(existing);
    existing.draft.name = "Keep my work";
    existing.customLevels[1].level.name = existing.draft.name;
    await seed(receiver, existing);
    const before = JSON.parse(await stored(receiver));
    await receiver.goto(decoded.data);
    await expect(receiver.getByRole("dialog")).toContainText("Sky workshop");
    expect(new URL(receiver.url()).hash).toBe("");
    expect(JSON.parse(await stored(receiver))).toEqual(before);
    await receiver.locator("#sheet-close").click();
    expect(JSON.parse(await stored(receiver))).toEqual(before);
    await receiver.locator("#import-level").click();
    await preview(receiver, shared.url);
    await receiver.locator("#add-level").click();
    const after = JSON.parse(await stored(receiver));
    expect({ ...after, customLevels: after.customLevels.slice(0, -1) }).toEqual(
      before,
    );
    expect(after.customLevels.at(-1).level).toEqual(portable);
    await receiver.reload();
    await receiver.locator("#my-levels").click();
    await expect(receiver.locator(".custom-card")).toHaveCount(3);
    await receiver.setViewportSize({ width: 932, height: 430 });
    await receiver
      .getByRole("button", { name: "Play Sky workshop", exact: true })
      .click();
    await expect(receiver.locator("#level-name")).toContainText("Sky workshop");
  } finally {
    await context.close();
  }
  expect(errors).toEqual([]);
});

test("cancelled native share is quiet; clipboard refusal leaves a selectable complete code", async ({
  page,
}) => {
  await seed(page);
  const before = await stored(page);
  await page.evaluate(() => {
    window.cancelShare = true;
    window.denyClipboard = true;
  });
  await page.locator("#my-levels").click();
  await page.getByRole("button", { name: "Share Sky workshop" }).click();
  await page.locator("#send-level").click();
  await expect(page.locator(".transfer .failed")).toHaveCount(0);
  await page.locator("#copy-level").click();
  await expect(page.locator("#level-code")).toBeVisible();
  expect(
    await decodeLevel(await page.locator("#level-code").inputValue()),
  ).toEqual(portable);
  expect(await stored(page)).toBe(before);
});

test("large levels offer a complete file, not a truncated or overly dense QR; file import works offline", async ({
  page,
}) => {
  const origin = await offlineOrigin();
  try {
    const large = {
      ...source,
      song: 7,
      objects: Array.from({ length: 600 }, (_, i) => ({
        ...object("grid", 3 + ((i * 13) % 700) / 10, ((i * 7) % 180) / 10),
        rotation: (i % 4) * 90,
        flipX: i % 3 === 0,
      })),
    };
    const save = {
      ...sourceSave,
      draft: large,
      customLevels: [{ id: 6, level: large }],
    };
    await seed(page, save, origin.url);
    await page.locator("#my-levels").click();
    await page.getByRole("button", { name: "Share Sky workshop" }).click();
    await expect(page.locator(".qr-fallback")).toBeVisible();
    await expect(page.locator(".level-qr")).toHaveCount(0);
    await page.locator("#copy-level").click();
    const code = await page.evaluate(() => window.copiedLevel);
    expect(await decodeLevel(code)).toEqual(large);
    const downloadWait = page.waitForEvent("download");
    await page.locator(".download-level").click();
    const download = await downloadWait;
    expect(download.suggestedFilename()).toBe("clone-dash-level.clonedash.txt");
    const bytes = await readFile(await download.path());
    expect(bytes.toString()).toBe(code);
    await page.locator("#send-level").click();
    await page.waitForFunction(() => !!window.sentLevel);
    const shared = await page.evaluate(() => window.sentLevel);
    if (new URL(origin.url).href.length + code.length + 7 > 4096)
      expect(shared.files).toEqual([code]);
    else expect(await decodeLevel(shared.url)).toEqual(large);
    await page.locator("#sheet-close").click();
    await page.locator("#import-level").click();
    // WebKit's offline emulation also refuses local file reads. Disconnect the
    // actual HTTP origin instead, keeping the browser's file picker functional.
    await origin.close();
    expect(
      await page.evaluate(async () => {
        try {
          await fetch("/network-proof", { cache: "no-store" });
          return false;
        } catch {
          return true;
        }
      }),
    ).toBe(true);
    await page.locator("#level-file").setInputFiles({
      name: "friend.clonedash.txt",
      mimeType: "text/plain",
      buffer: bytes,
    });
    await expect(page.locator("#add-level")).toBeVisible();
    await page.locator("#add-level").click();
    expect(JSON.parse(await stored(page)).customLevels.at(-1).level).toEqual(
      large,
    );
  } finally {
    await origin.close();
  }
});

test("invalid input and oversized files do not create or replace anything", async ({
  page,
}) => {
  await seed(page);
  const before = await stored(page);
  await openImport(page);
  for (const code of [
    "cdl9.0bad",
    "cdl1.1AAAA",
    "https://example.test/#level=a&level=b",
  ]) {
    await page.locator("#import-code").fill(code);
    await page.locator("#preview-level").click();
    await expect(page.locator(".transfer .failed")).toBeVisible();
    await expect(page.locator("#add-level")).toHaveCount(0);
    expect(await stored(page)).toBe(before);
  }
  await page.locator("#level-file").setInputFiles({
    name: "huge.txt",
    mimeType: "text/plain",
    buffer: Buffer.alloc(MAX_CODE + 1, 65),
  });
  await expect(page.locator(".transfer .failed")).toContainText("too large");
  expect(await stored(page)).toBe(before);
});

test("confirmation handles full and refused storage, preserving every previous byte", async ({
  page,
}) => {
  const packed = readSave(null, 9);
  while (packed.customLevels.length < 100) newLevel(packed);
  await seed(page, packed);
  const before = await stored(page);
  await openImport(page);
  await preview(page, await encodeLevel(portable));
  await page.locator("#add-level").click();
  await expect(page.locator(".transfer .failed")).toContainText("full");
  expect(await stored(page)).toBe(before);
  await page.evaluate(
    (save) => localStorage.setItem("clonedash.v1", JSON.stringify(save)),
    sourceSave,
  );
  const compact = await stored(page);
  await page.evaluate(() => {
    Storage.prototype.setItem = function () {};
  });
  await page.locator("#add-level").click();
  await expect(page.locator(".transfer .failed")).toContainText(
    "could not confirm",
  );
  expect(await stored(page)).toBe(compact);
});

test("confirmation preserves a newer save from another tab and does not switch its active draft", async ({
  page,
}) => {
  await seed(page);
  await openImport(page);
  await preview(page, await encodeLevel(portable));
  const latest = structuredClone(sourceSave);
  latest.customLevels.push({
    id: 7,
    level: { name: "New in another tab", length: 40, objects: [] },
  });
  latest.best[3] = 88;
  await page.evaluate(
    (save) => localStorage.setItem("clonedash.v1", JSON.stringify(save)),
    latest,
  );
  await page.locator("#add-level").click();
  const after = JSON.parse(await stored(page));
  expect(after.customLevels.slice(0, 2)).toEqual(latest.customLevels);
  expect(after.activeLevel).toBe(6);
  expect(after.draft).toEqual(latest.draft);
  expect(after.best).toEqual(latest.best);
});

test("share and import sheets fit phone widths with owned touch targets and no horizontal overflow", async ({
  page,
}) => {
  await seed(page);
  await page.locator("#my-levels").click();
  for (const [width, height] of [
    [360, 640],
    [360, 740],
    [430, 932],
    [932, 430],
  ]) {
    await page.setViewportSize({ width, height });
    await page.getByRole("button", { name: "Share Sky workshop" }).click();
    await expect(page.locator(".level-qr")).toBeVisible();
    const bounds = await page.evaluate(() => {
      const dialog = document.querySelector("#sheet");
      return {
        doc: document.documentElement.scrollWidth,
        body: document.body.scrollWidth,
        sheet: dialog.scrollWidth,
        client: dialog.clientWidth,
        heights: [
          ...dialog.querySelectorAll("button, a.download-level, summary"),
        ]
          .filter((e) => !e.hidden)
          .map((e) => e.getBoundingClientRect().height),
      };
    });
    expect(bounds.doc).toBe(width);
    expect(bounds.body).toBe(width);
    expect(bounds.sheet).toBeLessThanOrEqual(bounds.client);
    expect(bounds.heights.every((height) => height >= 44)).toBe(true);
    const close = await page.locator("#sheet-close").boundingBox();
    expect(close.y + close.height).toBeLessThanOrEqual(height);
    expect(
      await page.evaluate(
        ({ x, y, width, height }) =>
          document.elementFromPoint(x + width / 2, y + height / 2)?.id,
        close,
      ),
    ).toBe("sheet-close");
    for (const selector of [
      "#send-level",
      "#copy-level",
      ".download-level",
      "summary",
    ]) {
      await page.locator(selector).scrollIntoViewIfNeeded();
      expect(
        await page.locator(selector).evaluate((element) => {
          const box = element.getBoundingClientRect();
          return element.contains(
            document.elementFromPoint(
              box.x + box.width / 2,
              box.y + box.height / 2,
            ),
          );
        }),
        `${selector} owns its visible tap target`,
      ).toBe(true);
    }
    await page.locator("#sheet-content").evaluate((element) => {
      element.scrollTop = 0;
    });
    await page.screenshot({
      path: `test-results/share-${width}x${height}-${test.info().project.name}.png`,
    });
    await page.locator("#sheet-close").click();
    await page.locator("#import-level").click();
    await preview(page, await encodeLevel(portable));
    await page.screenshot({
      path: `test-results/import-${width}x${height}-${test.info().project.name}.png`,
    });
    expect(
      await page.evaluate(
        () =>
          document.querySelector("#sheet").scrollWidth -
          document.querySelector("#sheet").clientWidth,
      ),
    ).toBe(0);
    await page.locator("#sheet-close").click();
  }
});
