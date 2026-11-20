import { test, expect } from "./quiet.mjs";

test.use({ viewport: { width: 844, height: 390 }, hasTouch: true });

test("place ADV FOLLOW on a phone, switch leaders and axes, and reopen the saved draft", async ({ page }) => {
  await page.goto("/");
  await page.locator("#editor-open").tap();
  await page.getByRole("tab", { name: "TRIGGERS", exact: true }).tap();
  await page.getByRole("button", { name: "↝ ADV FOLLOW", exact: true }).tap();
  const [x,y] = await page.evaluate(() => {
    const top = document.querySelector(".editor-head").getBoundingClientRect().bottom;
    const floor = document.querySelector(".editor-controls").getBoundingClientRect().top - 18;
    const unit = Math.max(12, Math.min((floor - top - 14) / 7, innerWidth / 13.5, 82));
    return [5.1 * unit, floor - 0.5 * unit];
  });
  await page.touchscreen.tap(x,y);
  await expect(page.locator("#selection")).toContainText("GROUP 1 · FOLLOWS PLAYER · BOTH AXES");
  await page.locator("#edit-object").tap();
  const sheet = page.locator("dialog");
  await expect(sheet.locator("#trigger-time")).toHaveCount(0);
  await expect(sheet.locator("#follow-leader")).toHaveCount(0);
  await sheet.getByLabel("Group that follows").fill("4");
  await sheet.getByLabel("Group that follows").blur();
  await sheet.locator("#follow-source").selectOption("group");
  await sheet.getByLabel("Group to follow").fill("7");
  await sheet.getByLabel("Group to follow").blur();
  await sheet.getByLabel("Follow on").selectOption("x");
  await sheet.getByRole("button",{name:"DONE"}).tap();
  await expect(page.locator("#selection")).toContainText("GROUP 4 · FOLLOWS GROUP 7 · X ONLY");
  await page.reload();
  await page.locator("#editor-open").tap();
  await page.locator("#select-tool").tap();
  await page.touchscreen.tap(x,y);
  await expect(page.locator("#selection")).toContainText("GROUP 4 · FOLLOWS GROUP 7 · X ONLY");
  await page.locator("#edit-object").tap();
  await sheet.locator("#follow-source").selectOption("player");
  await sheet.getByLabel("Follow on").selectOption("y");
  await sheet.getByRole("button",{name:"DONE"}).tap();
  await expect(page.locator("#selection")).toContainText("GROUP 4 · FOLLOWS PLAYER · Y ONLY");
  const draft = await page.evaluate(() => JSON.parse(localStorage.getItem("clonedash.v1")).draft);
  const saved = draft.objects.find(o => o.type === "follow-trigger");
  expect(saved.target).toBe(4);
  expect(saved.axis).toBe("y");
  expect(saved.leader).toBeUndefined();
});
