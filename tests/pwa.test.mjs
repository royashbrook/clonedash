import test from "node:test";
import assert from "node:assert/strict";
import { updateControl } from "../src/pwa.ts";

// updateControl reaches for browser globals; supply the few a probe touches.
function browserless() {
  const window = Object.getOwnPropertyDescriptor(globalThis, "window");
  const build = Object.getOwnPropertyDescriptor(globalThis, "__BUILD_ID__");
  const { fetch, setTimeout, clearTimeout } = globalThis;
  globalThis.window = globalThis;
  globalThis.__BUILD_ID__ = "current";
  return () => {
    Object.assign(globalThis, { fetch, setTimeout, clearTimeout });
    for (const [key, descriptor] of [
      ["window", window],
      ["__BUILD_ID__", build],
    ])
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
  };
}
// A probe that never answers; only its signal can end it.
function stall(state) {
  return async (_url, options) =>
    new Promise((_resolve, reject) => {
      state.requests++;
      state.signal = options.signal;
      state.signal.addEventListener(
        "abort",
        () => reject(new DOMException("Aborted", "AbortError")),
        { once: true },
      );
    });
}

test("an update probe without the newer AbortSignal static helpers still fetches, aborts at its eight-second deadline and clears its timer", async () => {
  const any = Object.getOwnPropertyDescriptor(AbortSignal, "any");
  const timeout = Object.getOwnPropertyDescriptor(AbortSignal, "timeout");
  const restore = browserless();
  const state = { requests: 0, ready: 0 };
  let control, deadline, delay, cleared;
  try {
    Object.defineProperty(AbortSignal, "any", {
      configurable: true,
      value: undefined,
    });
    Object.defineProperty(AbortSignal, "timeout", {
      configurable: true,
      value: undefined,
    });
    globalThis.setTimeout = (callback, ms) => {
      deadline = callback;
      delay = ms;
      return 123;
    };
    globalThis.clearTimeout = (id) => {
      cleared = id;
    };
    globalThis.fetch = stall(state);
    control = updateControl(() => state.ready++);
    const probe = control.check();
    assert.equal(state.requests, 1);
    assert(state.signal instanceof AbortSignal);
    assert.equal(delay, 8000);
    assert.equal(state.signal.aborted, false);
    deadline();
    assert.equal(state.signal.aborted, true);
    await probe;
    assert.equal(cleared, 123);
    assert.equal(state.ready, 0);
  } finally {
    control?.dispose();
    restore();
    Object.defineProperty(AbortSignal, "any", any);
    Object.defineProperty(AbortSignal, "timeout", timeout);
  }
});

test("disposing the update control aborts an in-flight probe and clears its deadline", async () => {
  const restore = browserless();
  const state = { requests: 0, ready: 0 };
  let control, cleared;
  try {
    globalThis.setTimeout = () => 123;
    globalThis.clearTimeout = (id) => {
      cleared = id;
    };
    globalThis.fetch = stall(state);
    control = updateControl(() => state.ready++);
    const probe = control.check();
    assert.equal(state.signal.aborted, false);
    control.dispose();
    assert.equal(state.signal.aborted, true);
    await probe;
    assert.equal(cleared, 123);
    assert.equal(state.ready, 0);
  } finally {
    control?.dispose();
    restore();
  }
});
