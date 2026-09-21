import { test, expect } from "@playwright/test";

// PWA input guard (issue: fast taps double-tap-zoom, a hold raises the iOS callout/copy menu).
// The native iOS gestures cannot be synthesized headless, so we pin the MECHANISM that stops
// them: the page suppresses selection and the touch callout, blocks the zoom gesture, and still
// lets real text inputs be edited.
test("play surface blocks selection and the zoom gesture; text inputs stay editable", async ({
  page,
}) => {
  await page.goto("/");

  const body = await page.evaluate(() => {
    const s = getComputedStyle(document.body);
    return {
      userSelect: s.userSelect || s.webkitUserSelect,
      callout: s.getPropertyValue("-webkit-touch-callout"),
    };
  });
  expect(body.userSelect).toBe("none");
  if (body.callout) expect(body.callout).toBe("none"); // webkit reports it; chromium leaves it blank

  // a gesturestart (iOS pinch / double-tap zoom) must be prevented
  const prevented = await page.evaluate(() => {
    const e = new Event("gesturestart", { cancelable: true });
    window.dispatchEvent(e);
    return e.defaultPrevented;
  });
  expect(prevented).toBe(true);

  // text fields (the editor's level title) must stay selectable / editable
  const inputSelect = await page.evaluate(() => {
    const i = document.createElement("input");
    document.body.append(i);
    const v = getComputedStyle(i).userSelect || getComputedStyle(i).webkitUserSelect;
    i.remove();
    return v;
  });
  expect(inputSelect).toBe("text");
});
