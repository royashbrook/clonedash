import { test, expect } from "./quiet.mjs";
import { catalog } from "../src/catalog.ts";

for (const [i, trail] of catalog.levels.entries()) {
  test(`@catalog published trail ${31 + i}: opens from the collection and the direct link`, async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Play " + trail.name, exact: true }).click();
    await expect(page.locator("#level-name")).toContainText(trail.name, {ignoreCase:true});
    await page.goto("/?level=" + (31 + i));
    await expect(page.locator("#hud")).toBeVisible();
    await expect(page.locator("#level-name")).toContainText(trail.name, {ignoreCase:true});
  });
}

for (const [kind, shelf, input, key] of [
  ["skins", "#skins-open", "#skin-name", "clonedash.skins.v1"],
  ["loops", "#loops-open", "#loop-name", "clonedash.loops.v1"],
  ["songs", "#loops-open", "input[maxlength='40']", "clonedash.songs.v1"],
]) {
  for (const [i, item] of catalog[kind].entries()) {
    test(`@catalog published ${kind} ${i+1}: opens a copy without touching the personal library`, async ({page}) => {
      await page.goto("/");
      await page.locator(shelf).click();
      if(kind === "songs") await page.locator("#my-songs").click();
      const before = await page.evaluate(k => localStorage.getItem(k), key);
      await page.getByRole("button", {name:"OPEN COPY",exact:true}).nth(i).click();
      await expect(page.locator(input).filter({visible:true})).toHaveValue(item.name);
      expect(await page.evaluate(k => localStorage.getItem(k), key)).toBe(before);
    });
  }
}
