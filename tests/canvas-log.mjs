import { render } from "../src/render.ts";

// the window render sizes itself from: a phone held sideways, at twice the pixels
Object.assign(globalThis, { innerWidth: 932, innerHeight: 430, devicePixelRatio: 2 });

// A canvas context that logs commands and tracks the current transform, so a drawn image's
// rectangle can be read back in screen pixels.
export function canvasLog(options) {
  const log = [],
    stack = [];
  let m = [1, 0, 0, 1, 0, 0];
  const ops = {
    setTransform: (a, b, c, d, e, f) => (m = [a, b, c, d, e, f]),
    save: () => stack.push(m),
    restore: () => (m = stack.pop()),
    translate: (x, y) => (m = [m[0], m[1], m[2], m[3], m[4] + m[0] * x + m[2] * y, m[5] + m[1] * x + m[3] * y]),
    scale: (x, y) => (m = [m[0] * x, m[1] * x, m[2] * y, m[3] * y, m[4], m[5]]),
    rotate: (r) => {
      const [a, b, c, d] = m,
        cos = Math.cos(r),
        sin = Math.sin(r);
      m = [a * cos + c * sin, b * cos + d * sin, c * cos - a * sin, d * cos - b * sin, m[4], m[5]];
    },
    drawImage: (image, x, y, w, h) => {
      const at = (px, py) => [(m[0] * px + m[2] * py + m[4]) / 2, (m[1] * px + m[3] * py + m[5]) / 2];
      const [p, q] = [at(x, y), at(x + w, y + h)];
      log.push(["screen", Math.min(p[0], q[0]), Math.min(p[1], q[1]), Math.max(p[0], q[0]), Math.max(p[1], q[1])]);
    },
  };
  const values = {};
  const ctx = new Proxy(values, {
    set(target, key, value) {
      target[key] = value;
      log.push(["set", key, value]);
      return true;
    },
    get(target, key) {
      if (key in target) return target[key];
      return (...args) => {
        log.push([key, ...args]);
        ops[key]?.(...args);
        if (key === "createLinearGradient") return { addColorStop() {} };
      };
    },
  });
  const view = render({ width: 1864, height: 860, getContext: () => ctx }, options);
  return { log: JSON.parse(JSON.stringify(log)), view };
}
// the player is the last thing drawn inside its own save/restore
export const player = (log) => log.slice(log.findLastIndex((c) => c[0] === "save"));
