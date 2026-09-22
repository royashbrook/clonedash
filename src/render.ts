import {
  polygon,
  bounds,
  PORTALS,
  RAMPS,
  SIZE,
  ringReady,
  levelHeight,
} from "./engine.ts";
import type { GameState, Level } from "./types.ts";
const portalLook: Record<string, [string, string, string]> = {
  plane: ["#ffd166", "FLY", "▷"],
  square: ["#72f7dc", "JUMP", "□"],
  wheel: ["#ff8ac4", "WHEEL", "⊙"],
  jumper: ["#53e3ff", "POGO", "⇈"],
  "gravity-up": ["#53e3ff", "UP", "↑"],
  "gravity-down": ["#ffb477", "DOWN", "↓"],
};
// How wide the player is DRAWN, in blocks. The physics body stays SIZE (0.64): this is the
// visual-only answer to "he looks tiny next to the blocks". A physics retune is a separate call.
export const AVATAR = 1;
export interface RenderOptions {
  state: GameState | null;
  level: Level;
  camera?: number;
  cameraY?: number;
  editing?: boolean;
  selected?: number;
  layer?: string;
  time?: number;
  reduced?: boolean;
  areaBottom?: number;
  areaTop?: number;
  avatar?: number;
}
export function render(
  canvas: HTMLCanvasElement,
  {
    state,
    level,
    camera = 0,
    cameraY = 0,
    editing = false,
    selected = -1,
    layer,
    time = 0,
    reduced = false,
    areaBottom,
    areaTop = 0,
    avatar = AVATAR,
  }: RenderOptions,
) {
  const w = innerWidth,
    h = innerHeight,
    dpr = Math.min(devicePixelRatio || 1, 2);
  if (
    canvas.width !== Math.round(w * dpr) ||
    canvas.height !== Math.round(h * dpr)
  ) {
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
  }
  const ctx = canvas.getContext("2d");
  if (!ctx) throw Error("Canvas 2D unavailable");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const floor = editing
    ? (areaBottom ?? h - 180) - 18
    : h - Math.max(42, h * 0.16);
  const height = levelHeight(level),
    hasGravity =
      height > 7 ||
      level.objects.some((o) =>
        ["wheel", "gravity-up", "gravity-down"].includes(o.type),
      );
  const top = !editing && hasGravity ? Math.max(84, areaTop) : areaTop;
  const unit = Math.max(12, Math.min((floor - top - 14) / 7, w / 13.5, 82));
  const X = (x: number) => (x - camera) * unit,
    Y = (y: number) => floor - (y - cameraY) * unit,
    ground = Y(0);
  const color = level.color || "#9aff6b";
  const bg = ctx.createLinearGradient(0, 0, w, h);
  bg.addColorStop(0, "#101825");
  bg.addColorStop(1, "#172c3d");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);
  ctx.lineWidth = 1;
  // Geometric parallax is deliberately subtle: the next obstacle stays the focal point.
  ctx.strokeStyle = "#ffffff09";
  for (let x = -((camera * unit * 0.25) % (unit * 2)); x < w; x += unit * 2) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, h);
    ctx.stroke();
  }
  for (let y = floor % (unit * 2); y < h; y += unit * 2) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
  }
  if (!editing) {
    ctx.strokeStyle = `${color}12`;
    ctx.lineWidth = 2;
    for (let i = 0; i < 8; i++) {
      const x =
        ((((i * 247 - camera * unit * 0.13) % (w + 300)) + w + 300) %
          (w + 300)) -
        150;
      const y = h * 0.27 + Math.sin(i * 4) * h * 0.12;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(0.3 + i);
      ctx.strokeRect(-40, -40, 80, 80);
      ctx.restore();
    }
  } else {
    ctx.strokeStyle = "#ffffff25";
    ctx.lineWidth = 1;
    for (let x = Math.floor(camera); X(x) < w; x++) {
      ctx.beginPath();
      ctx.moveTo(X(x), areaTop);
      ctx.lineTo(X(x), floor);
      ctx.stroke();
      if (x % 5 === 0) {
        ctx.fillStyle = "#b6c5d8";
        ctx.font = "12px monospace";
        ctx.fillText(String(x), X(x) + 3, floor + 14);
      }
    }
    for (let y = Math.ceil(cameraY); y <= Math.min(height, cameraY + 8); y++) {
      ctx.beginPath();
      ctx.moveTo(0, Y(y));
      ctx.lineTo(w, Y(y));
      ctx.stroke();
      ctx.fillStyle = "#b6c5d8";
      ctx.font = "12px monospace";
      ctx.fillText(String(y), 4, Y(y) - 3);
    }
    ctx.fillStyle = "#9aff6b12";
    ctx.fillRect(X(0), Y(height), 3 * unit, height * unit);
  }
  ctx.fillStyle = "#0a111c";
  ctx.fillRect(0, ground, w, Math.max(0, h - ground));
  ctx.strokeStyle = `${color}30`;
  ctx.lineWidth = 1;
  if (ground < h)
    for (let x = -((camera * unit) % (unit / 2)); x < w; x += unit / 2) {
      ctx.beginPath();
      ctx.moveTo(x, ground);
      ctx.lineTo(x - h * 0.2, h);
      ctx.stroke();
    }
  for (let y = ground + 14; y < h; y += 18) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
  }
  ctx.fillStyle = color;
  ctx.fillRect(0, ground, w, 2);
  if (hasGravity) {
    ctx.fillStyle = "#0a111c";
    ctx.fillRect(0, Y(height) - 12, w, 12);
    ctx.fillStyle = color;
    ctx.fillRect(0, Y(height) - 2, w, 2);
  }
  for (const background of [true, false])
    level.objects.forEach((o, index) => {
      if ((o.layer === "background") !== background) return;
      const k = o.scale ?? 1; // a scaled piece reaches further than its anchor cell
      if (X(o.x) < -unit * 2 * k || X(o.x) > w + unit * k) return;
      ctx.save();
      ctx.globalAlpha = background
        ? editing && layer === "background"
          ? 0.65
          : 0.3
        : 1;
      if (o.type === "ring") {
        const active = state && ringReady(state, o, index),
          used = state?.usedRings.includes(index);
        ctx.save();
        ctx.globalAlpha = used ? 0.25 : 1;
        ctx.strokeStyle = active ? "#ffffff" : "#ffd166";
        ctx.lineWidth = active ? 4 : 3;
        ctx.beginPath();
        ctx.arc(X(o.x + 0.5), Y(o.y + 0.5), unit * 0.45, 0, Math.PI * 2);
        ctx.stroke();
        ctx.strokeStyle = "#ffd16666";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(X(o.x + 0.5), Y(o.y + 0.5), unit * 0.6, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = "#ffd166";
        ctx.font = `bold ${unit * 0.4}px system-ui`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(
          (state?.gravity ?? -1) > 0 ? "↓" : "↑",
          X(o.x + 0.5),
          Y(o.y + 0.5),
        );
        ctx.restore();
      } else if (PORTALS.includes(o.type)) {
        const x = X(o.x + 0.3),
          y = Y(o.y + 1.25),
          [c, label, icon] = portalLook[o.type];
        ctx.save();
        ctx.strokeStyle = c;
        ctx.lineWidth = 3;
        ctx.fillStyle = `${c}18`;
        ctx.beginPath();
        ctx.ellipse(
          x,
          y,
          unit * 0.3,
          unit * 1.25,
          (-o.rotation * Math.PI) / 180,
          0,
          Math.PI * 2,
        );
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = c;
        ctx.font = `bold ${Math.max(12, unit * 0.28)}px system-ui`;
        ctx.textAlign = "center";
        ctx.fillText(label, x, y - unit * 1.4);
        ctx.translate(x, y);
        ctx.rotate((-o.rotation * Math.PI) / 180);
        ctx.scale(o.flipX ? -1 : 1, o.flipY ? -1 : 1);
        ctx.strokeStyle = "#fff";
        ctx.lineWidth = 2;
        ctx.fillStyle = "#fff";
        ctx.font = `bold ${unit * 0.55}px system-ui`;
        ctx.textBaseline = "middle";
        ctx.fillText(icon, 0, 0);
        ctx.restore();
      } else {
        const p = polygon(o);
        ctx.beginPath();
        p.forEach(([x, y], i) =>
          i ? ctx.lineTo(X(x), Y(y)) : ctx.moveTo(X(x), Y(y)),
        );
        ctx.closePath();
        // Unscaled pieces keep the literal cell maths so the pre-migration parity pin holds;
        // a scaled piece shades and grids across its real bounds.
        const b = o.scale === undefined ? null : bounds(o);
        const cellTop = b ? b.top : o.y + 1,
          cellBottom = b ? b.bottom : o.y,
          cellLeft = b ? b.left : o.x,
          cellRight = b ? b.right : o.x + 1;
        const grad = ctx.createLinearGradient(0, Y(cellTop), 0, Y(cellBottom));
        grad.addColorStop(0, "#35465d");
        grad.addColorStop(1, "#03070c");
        ctx.fillStyle = ["black", "plain-black", "ramp-black"].includes(o.type)
          ? "#000000"
          : grad;
        if (o.type !== "outline") ctx.fill();
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 2;
        if (!RAMPS.includes(o.type) && o.type !== "plain-black") ctx.stroke();
        if (o.type === "grid" || o.type === "ramp-grid") {
          ctx.save();
          ctx.clip();
          ctx.strokeStyle = "#ffffff35";
          ctx.lineWidth = 1;
          const span = cellRight - cellLeft,
            rise = cellTop - cellBottom;
          for (let q = 1; q <= 3; q++) {
            ctx.beginPath();
            ctx.moveTo(X(cellLeft + (span * q) / 4), Y(cellBottom));
            ctx.lineTo(X(cellLeft + (span * q) / 4), Y(cellTop));
            ctx.moveTo(X(cellLeft), Y(cellBottom + (rise * q) / 4));
            ctx.lineTo(X(cellRight), Y(cellBottom + (rise * q) / 4));
            ctx.stroke();
          }
          ctx.restore();
        }
        if (RAMPS.includes(o.type)) {
          ctx.beginPath();
          ctx.moveTo(X(p[0][0]), Y(p[0][1]));
          ctx.lineTo(X(p[2][0]), Y(p[2][1]));
          ctx.strokeStyle = "#ffffff";
          ctx.lineWidth = 2;
          ctx.stroke();
        }
      }
      if (editing && index === selected) {
        ctx.globalAlpha = 1;
        const b = bounds(o);
        ctx.strokeStyle = "#9aff6b";
        ctx.lineWidth = 3;
        ctx.setLineDash([5, 3]);
        ctx.strokeRect(
          X(b.left) - 5,
          Y(b.top) - 5,
          (b.right - b.left) * unit + 10,
          (b.top - b.bottom) * unit + 10,
        );
        ctx.setLineDash([]);
      }
      ctx.restore();
    });
  if (X(level.length) < w + 100) {
    ctx.fillStyle = `${color}12`;
    ctx.fillRect(X(level.length), Y(height), unit * 2, unit * height);
    ctx.fillStyle = color;
    ctx.font = "bold 14px system-ui";
    ctx.fillText("FINISH", X(level.length) - 12, Y(3));
    for (let y = 0; y < 6; y++)
      for (let x = 0; x < 2; x++)
        if ((x + y) % 2 === 0)
          ctx.fillRect(
            X(level.length + x * 0.18),
            Y(y * 0.25 + 0.25),
            unit * 0.18,
            unit * 0.25,
          );
  }
  if (state) {
    // Feet sit on the body's bottom edge (head on its top edge when inverted), so an avatar
    // drawn larger than the physics body never sinks into what it stands on. At
    // avatar === SIZE this is exactly the body's center, i.e. the legacy drawing.
    const x = X(state.x + SIZE / 2),
      y = Y(state.y + (state.gravity > 0 ? SIZE - avatar / 2 : avatar / 2));
    ctx.save();
    ctx.translate(x, y);
    if (state.status === "dead") {
      const t = Math.min(time, 0.6);
      if (!reduced)
        for (let i = 0; i < 12; i++) {
          const a = i * 2.4;
          ctx.globalAlpha = 1 - t / 0.65;
          ctx.fillStyle = color;
          ctx.fillRect(
            Math.cos(a) * t * unit * 3,
            Math.sin(a) * t * unit * 3 + t * t * unit,
            unit * 0.12,
            unit * 0.12,
          );
        }
    } else {
      // One uniform scale grows every mode's shape together. Not emitted at the legacy size, so
      // the pre-migration parity pin (migration.test.mjs) stays byte-identical.
      const k = avatar / SIZE;
      if (k !== 1) ctx.scale(k, k);
      if (!reduced) {
        ctx.fillStyle = `${color}35`;
        for (let i = 3; i >= 1; i--)
          ctx.fillRect(
            -unit * (0.3 + i * 0.18),
            -unit * 0.15,
            unit * 0.2,
            unit * 0.3,
          );
      }
      if (state.mode === "square" || state.mode === "jumper") {
        if (state.gravity > 0) ctx.scale(1, -1);
        if (!state.grounded && !reduced) ctx.rotate(-state.time * Math.PI * 2);
        const a = SIZE * unit;
        ctx.fillStyle = color;
        ctx.strokeStyle = "#fff";
        ctx.lineWidth = 2;
        ctx.fillRect(-a / 2, -a / 2, a, a);
        ctx.strokeRect(-a / 2, -a / 2, a, a);
        ctx.fillStyle = "#101825";
        if (state.mode === "jumper") {
          ctx.strokeStyle = "#101825";
          ctx.lineWidth = Math.max(2, a * 0.08);
          for (const offset of [-0.12, 0.15]) {
            ctx.beginPath();
            ctx.moveTo(-a * 0.23, a * (offset + 0.1));
            ctx.lineTo(0, a * (offset - 0.12));
            ctx.lineTo(a * 0.23, a * (offset + 0.1));
            ctx.stroke();
          }
        } else {
          ctx.fillRect(-a * 0.27, -a * 0.18, a * 0.15, a * 0.17);
          ctx.fillRect(a * 0.12, -a * 0.18, a * 0.15, a * 0.17);
          ctx.fillRect(-a * 0.22, a * 0.18, a * 0.44, a * 0.06);
        }
      } else if (state.mode === "wheel") {
        const r = (SIZE * unit) / 2;
        ctx.save();
        if (!reduced) ctx.rotate(state.x * 3 * -state.gravity);
        ctx.fillStyle = color;
        ctx.strokeStyle = "#fff";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(0, 0, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.strokeStyle = "#101825";
        for (let i = 0; i < 8; i++) {
          const a = (i * Math.PI) / 4;
          ctx.beginPath();
          ctx.moveTo(Math.cos(a) * r * 0.7, Math.sin(a) * r * 0.7);
          ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
          ctx.stroke();
        }
        ctx.restore();
        ctx.fillStyle = "#101825";
        ctx.font = `bold ${r * 1.6}px system-ui`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(state.gravity > 0 ? "↑" : "↓", 0, 0);
      } else {
        if (state.gravity > 0) ctx.scale(1, -1);
        ctx.rotate(-state.vy * 0.06);
        ctx.fillStyle = color;
        ctx.strokeStyle = "#fff";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(unit * 0.42, 0);
        ctx.lineTo(-unit * 0.34, -unit * 0.29);
        ctx.lineTo(-unit * 0.17, 0);
        ctx.lineTo(-unit * 0.34, unit * 0.29);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = "#101825";
        ctx.fillRect(-unit * 0.05, -unit * 0.07, unit * 0.12, unit * 0.14);
      }
    }
    ctx.restore();
  }
  return {
    unit,
    floor,
    camera,
    cameraY,
    x: (x: number) => x / unit + camera,
    y: (y: number) => (floor - y) / unit + cameraY,
  };
}
