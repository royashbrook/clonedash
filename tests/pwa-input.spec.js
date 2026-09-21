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

  // text fields must stay selectable / editable. the one that matters is the readonly share-code
  // textarea in LevelTransfer ("Select and copy the code below" fallback): select() must still work.
  const fields = await page.evaluate(() => {
    const sel = (e) => getComputedStyle(e).userSelect || getComputedStyle(e).webkitUserSelect;
    const i = document.createElement("input");
    const t = document.createElement("textarea");
    t.readOnly = true;
    t.value = "ABC123";
    document.body.append(i, t);
    t.select();
    const out = { input: sel(i), textarea: sel(t), selected: t.selectionEnd - t.selectionStart };
    i.remove();
    t.remove();
    return out;
  });
  expect(fields.input).toBe("text");
  expect(fields.textarea).toBe("text");
  expect(fields.selected).toBe(6);
});
