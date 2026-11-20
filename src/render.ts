import {
  polygon,
  bounds,
  PORTALS,
  SLOPES,
  ZONES,
  SIZE,
  SPEED,
  ringReady,
  destination,
  levelHeight,
  tintOf,
  TRIGGERS,
  COIN_RADIUS,
  PADS,
  pointOf,
  reach,
  scaleOf,
  sized,
  centred,
  axes,
  RINGS,
} from "./engine.ts";
import type { GameState, Level } from "./types.ts";
import { skinBox, type SkinArt } from "./skin.ts";
import { newSpin, spinAt, type Spin } from "./spin.ts";

// each run's turn, by its state object: a restart makes a new state, so it starts upright
const SPINS = new WeakMap<GameState, Spin>();
// A colour trigger's colour laid over a piece's own colour (#rrggbb), for the pieces drawn in one
// colour: rings, portals and coins.
const hex = (v: number) => Math.round(v).toString(16).padStart(2, "0");
function over(base: string, t: Float64Array | null) {
  if (!t) return base;
  const at = (k: number) => parseInt(base.slice(1 + k * 2, 3 + k * 2), 16);
  return `#${hex(at(0) + (t[0] - at(0)) * t[3])}${hex(at(1) + (t[1] - at(1)) * t[3])}${hex(at(2) + (t[2] - at(2)) * t[3])}`;
}
export const COIN = "#ffd166";
// a booster is drawn in the colour of the ring it matches (#106)
export const PAD_LOOK: Record<string, string> = {
  "yellow-pad": "#ffd166",
  "pink-pad": "#ff8ac4",
  "red-pad": "#ff5c7a",
  "blue-pad": "#2b4cff",
  "green-pad": "#9aff6b",
  "black-pad": "#000000",
  "gray-pad": "#9a9a9a",
};
const TRIGGER_LOOK: Record<string, [string, string]> = {
  "follow-trigger": ["#9aff6b", "FOLLOW"],
  "move-trigger": ["#53e3ff", "MOVE"],
  "color-trigger": ["#ff8ac4", "COLOR"],
  "teleport-trigger": ["#b388ff", "TELEPORT"],
};
const portalLook: Record<string, [string, string, string]> = {
  plane: ["#ffd166", "FLY", "▷"],
  square: ["#72f7dc", "JUMP", "□"],
  wheel: ["#ff8ac4", "WHEEL", "⊙"],
  pogo: ["#53e3ff", "POGO", "⇈"],
  angle: ["#c77dff", "ANGLE", "◢"],
  croissant: ["#f4a259", "CROISSANT", "☾"],
  door: ["#ffc582", "DOOR", "⚿"],
  "gravity-up": ["#53e3ff", "UP", "↑"],
  "gravity-down": ["#ffb477", "DOWN", "↓"],
  "speed-slow": ["#ffb477", "SLOW", "<"],
  "speed-normal": ["#72f7dc", "1X", ">"],
  "speed-fast": ["#53e3ff", "FAST", ">>"],
  "speed-faster": ["#ff8ac4", "FASTER", ">>>"],
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
  group?: number[]; // multi-select: every piece in it is outlined like the selected one
  box?: { left: number; right: number; bottom: number; top: number } | null; // a swipe in progress
  layer?: string;
  time?: number;
  reduced?: boolean;
  areaBottom?: number;
  areaTop?: number;
  avatar?: number;
  skin?: SkinArt | null; // a chosen skin, drawn in square mode only (docs/skins.md)
  view?: { width: number; height: number }; // a smaller canvas than the window (the skin preview)
  zoom?: number; // scales the block size; 1 everywhere but a phone held upright (the player picks it)
  showCeiling?: boolean;
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
    group = [],
    box,
    layer,
    time = 0,
    reduced = false,
    areaBottom,
    areaTop = 0,
    avatar = AVATAR,
    skin = null,
    view,
    zoom = 1,
    showCeiling = false,
  }: RenderOptions,
) {
  const w = view?.width ?? innerWidth,
    h = view?.height ?? innerHeight,
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
        ["wheel", "croissant", "gravity-up", "gravity-down"].includes(o.type),
      );
  const top = !editing && hasGravity ? Math.max(84, areaTop) : areaTop;
  const unit = Math.max(12, Math.min((floor - top - 14) / 7, w / 13.5, 82)) * zoom;
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
    for (let y = Math.ceil(cameraY); y <= (level.offMap ? cameraY + 8 : Math.min(height, cameraY + 8)); y++) {
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
  // In the off-map editor the construction grid continues below the actual floor.
  const openGrid = editing && level.offMap;
  if (!openGrid) ctx.fillRect(0, ground, w, Math.max(0, h - ground));
  ctx.strokeStyle = `${color}30`;
  ctx.lineWidth = 1;
  if (!openGrid && ground < h)
    for (let x = -((camera * unit) % (unit / 2)); x < w; x += unit / 2) {
      ctx.beginPath();
      ctx.moveTo(x, ground);
      ctx.lineTo(x - h * 0.2, h);
      ctx.stroke();
    }
  for (let y = ground + 14; !openGrid && y < h; y += 18) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
  }
  ctx.fillStyle = color;
  ctx.fillRect(0, ground, w, 2);
  const ceiling = Y(height);
  if (editing && level.offMap) {
    ctx.strokeStyle = "#b6c5d8";
    ctx.lineWidth = 2;
    ctx.strokeRect(X(0), ceiling, level.length * unit, height * unit);
  }
  if (showCeiling && ceiling > 0) {
    ctx.fillStyle = "#07101b66";
    ctx.fillRect(0, 0, w, Math.min(h, ceiling));
  }
  if ((hasGravity || showCeiling) && ceiling > 0 && ceiling - 12 < h) {
    ctx.fillStyle = "#0a111c";
    ctx.fillRect(0, ceiling - 12, w, 12);
    ctx.fillStyle = hasGravity ? color : "#afc2d4";
    ctx.fillRect(0, ceiling - 2, w, 2);
  }
  for (const background of [true, false])
    level.objects.forEach((o, index) => {
      if ((o.layer === "background") !== background) return;
      if ((ZONES.includes(o.type) || TRIGGERS.includes(o.type)) && state && !editing) return; // invisible in play
      if (o.hidden && !editing) return; // HIDDEN: still solid, never drawn outside the editor (#96)
      if (o.type === "coin" && state?.fx?.got[index]) return; // picked up this run
      // o is the run's own moved piece in play, so a piece a trigger moves into view is drawn
      // where it collides. An unsized piece keeps the cull it always had; a sized one is culled by
      // how far its shape reaches (#106), the same reach the contact pass uses.
      if (
        !sized(o)
          ? X(o.x) < -unit * 2 || X(o.x) > w + unit
          : X(o.x + reach(o)) < 0 || X(o.x - reach(o)) > w
      )
        return;
      // where a round piece's middle is, and how many times its drawing is grown (rule 5b). A width
      // and height piece (#117) is drawn at size 1 inside a stretch about its middle, along its own
      // turned axes, the same stretch polygon() and inReach() use.
      const wide = centred(o),
        s = wide ? 1 : scaleOf(o),
        [mx, my] = pointOf(o, 0.5, 0.5),
        stretch = (cx: number, cy: number) => {
          if (!wide) return;
          const a = (-o.rotation * Math.PI) / 180;
          ctx.translate(X(cx), Y(cy));
          ctx.rotate(a);
          ctx.scale(o.scaleX!, o.scaleY!);
          ctx.rotate(-a);
          ctx.translate(-X(cx), -Y(cy));
        };
      // a colour trigger's colour, read on the run's clock (null for an untouched piece)
      const tint = state?.fx ? tintOf(state.fx, index, state.time) : null;
      ctx.save();
      ctx.globalAlpha = background
        ? editing && layer === "background"
          ? 0.65
          : 0.3
        : 1;
      if (o.hidden) ctx.globalAlpha *= 0.3; // faint, so it can still be found and edited
      if (RINGS.includes(o.type)) {
        const drop = o.type === "drop-ring",
          stop = o.type === "stop-ring",
          tele = o.type === "teleport-ring";
        const active = state && ringReady(state, o, index),
          used = state?.usedRings.includes(index),
          c = over(o.color ?? "#ffd166", tint);
        ctx.save();
        stretch(mx, my);
        ctx.globalAlpha *= used ? 0.25 : 1;
        ctx.strokeStyle = active ? "#ffffff" : c;
        ctx.lineWidth = active ? 4 : 3;
        ctx.beginPath();
        ctx.arc(X(mx), Y(my), unit * 0.45 * s, 0, Math.PI * 2);
        ctx.stroke();
        ctx.strokeStyle = `${c}66`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(X(mx), Y(my), unit * 0.6 * s, 0, Math.PI * 2);
        ctx.stroke();
        if (o.flipsGravity || o.dash || drop || stop || tele) {
          // gravity rings, the dash orb and the black and gray rings are orbs: filled, so they read
          // apart from the jump rings
          ctx.fillStyle = `${c}88`;
          ctx.beginPath();
          ctx.arc(X(mx), Y(my), unit * 0.45 * s, 0, Math.PI * 2);
          ctx.fill();
        }
        if ((drop || stop) && !active) {
          // a thin white rim, so a black orb shows on the dark sky
          ctx.strokeStyle = "#ffffff";
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.arc(X(mx), Y(my), unit * 0.45 * s, 0, Math.PI * 2);
          ctx.stroke();
        }
        if (o.dash) {
          // a > turned the way the orb points (the canvas y runs down, so the turn is negated)
          const a = (-o.rotation * Math.PI) / 180,
            r = unit * 0.2 * s,
            at = (x: number, y: number) =>
              [X(mx) + x * Math.cos(a) - y * Math.sin(a), Y(my) + x * Math.sin(a) + y * Math.cos(a)] as const;
          ctx.strokeStyle = "#ffffff";
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.moveTo(...at(-r * 0.6, -r));
          ctx.lineTo(...at(r * 0.6, 0));
          ctx.lineTo(...at(-r * 0.6, r));
          ctx.stroke();
        } else {
          const down = (state?.gravity ?? -1) < 0;
          ctx.fillStyle = o.flipsGravity || drop || stop || tele ? "#ffffff" : c;
          ctx.font = `bold ${unit * 0.4 * s}px system-ui`;
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText(
            tele
              ? "⇥"
              : o.flipsGravity
              ? o.boost
                ? "⇈"
                : "⇅"
              : drop // the black ring's arrow points the way gravity pulls
                ? down
                  ? "↓"
                  : "↑"
                : stop
                  ? "−"
                  : down
                    ? "↑"
                    : "↓",
            X(mx),
            Y(my),
          );
        }
        ctx.restore();
      } else if (PORTALS.includes(o.type)) {
        const [px, py] = pointOf(o, 0.3, 1.25),
          x = X(px),
          y = Y(py),
          [look, label, icon] = portalLook[o.type],
          c = over(look, tint);
        ctx.save();
        stretch(px, py);
        ctx.strokeStyle = c;
        ctx.lineWidth = 3;
        ctx.fillStyle = `${c}18`;
        ctx.beginPath();
        ctx.ellipse(
          x,
          y,
          unit * 0.3 * s,
          unit * 1.25 * s,
          (-o.rotation * Math.PI) / 180,
          0,
          Math.PI * 2,
        );
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = c;
        ctx.font = `bold ${Math.max(12, unit * 0.28)}px system-ui`;
        ctx.textAlign = "center";
        ctx.fillText(label, x, y - unit * 1.4 * s);
        ctx.translate(x, y);
        ctx.rotate((-o.rotation * Math.PI) / 180);
        ctx.scale(o.flipX ? -1 : 1, o.flipY ? -1 : 1);
        ctx.strokeStyle = "#fff";
        ctx.lineWidth = 2;
        ctx.fillStyle = "#fff";
        ctx.font = `bold ${unit * 0.55 * s}px system-ui`;
        ctx.textBaseline = "middle";
        ctx.fillText(icon, 0, 0);
        ctx.restore();
      } else if (o.type === "coin") {
        const c = over(COIN, tint),
          r = unit * COIN_RADIUS * s;
        stretch(mx, my);
        ctx.fillStyle = c;
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(X(mx), Y(my), r, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.strokeStyle = "#b8860b";
        ctx.beginPath();
        ctx.arc(X(mx), Y(my), r * 0.6, 0, Math.PI * 2);
        ctx.stroke();
      } else if (PADS.includes(o.type)) {
        // a booster: its strip in its ring's colour, the face it fires from lit white
        const p = polygon(o),
          c = over(PAD_LOOK[o.type], tint);
        ctx.beginPath();
        p.forEach(([x, y], i) => (i ? ctx.lineTo(X(x), Y(y)) : ctx.moveTo(X(x), Y(y))));
        ctx.closePath();
        ctx.fillStyle = c;
        ctx.fill();
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(X(p[3][0]), Y(p[3][1]));
        ctx.lineTo(X(p[2][0]), Y(p[2][1]));
        ctx.lineWidth = 3;
        ctx.stroke();
      } else if (TRIGGERS.includes(o.type)) {
        // editor only: a dashed cell with what it does and the group it works on
        const [look, word] = TRIGGER_LOOK[o.type],
          c = o.type === "color-trigger" ? (o.color ?? "#ffd166") : look;
        ctx.strokeStyle = c;
        ctx.fillStyle = `${c}22`;
        ctx.lineWidth = 2;
        ctx.setLineDash([unit * 0.12, unit * 0.08]);
        ctx.fillRect(X(o.x), Y(o.y + 1), unit, unit);
        ctx.strokeRect(X(o.x), Y(o.y + 1), unit, unit);
        ctx.setLineDash([]);
        ctx.fillStyle = c;
        ctx.font = `bold ${Math.max(9, unit * 0.27)}px system-ui`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(word, X(o.x + 0.5), Y(o.y + 0.7));
        ctx.fillText(o.target === undefined ? "G -" : `G ${o.target}`, X(o.x + 0.5), Y(o.y + 0.3));
      } else {
        const p = polygon(o);
        ctx.beginPath();
        p.forEach(([x, y], i) =>
          i ? ctx.lineTo(X(x), Y(y)) : ctx.moveTo(X(x), Y(y)),
        );
        ctx.closePath();
        // Unscaled pieces keep the literal cell maths so the pre-migration parity pin holds;
        // a scaled piece shades and grids across its real bounds.
        const b = sized(o) ? bounds(o) : null;
        const cellTop = b ? b.top : o.y + 1,
          cellBottom = b ? b.bottom : o.y,
          cellLeft = b ? b.left : o.x,
          cellRight = b ? b.right : o.x + 1;
        const grad = ctx.createLinearGradient(0, Y(cellTop), 0, Y(cellBottom));
        grad.addColorStop(0, "#35465d");
        grad.addColorStop(1, "#03070c");
        ctx.fillStyle = ["black", "plain-black", "ramp-black", "scoop-black", "hill-black"].includes(o.type)
          ? "#000000"
          : grad;
        if (o.type !== "outline" && !ZONES.includes(o.type)) ctx.fill();
        if (tint) {
          // a colour trigger's colour over the piece, as much of it as the fade has reached
          ctx.fillStyle = `rgba(${Math.round(tint[0])},${Math.round(tint[1])},${Math.round(tint[2])},${tint[3]})`;
          ctx.fill();
        }
        // a zone is coloured and dashed, so the block it lies over still reads as that block
        const zoneColor = o.type === "w-block" ? "#53e3ff" : "#ffb477";
        ctx.strokeStyle = ZONES.includes(o.type) ? zoneColor : "#ffffff";
        ctx.lineWidth = 2;
        if (ZONES.includes(o.type)) ctx.setLineDash([unit * 0.12, unit * 0.08]);
        if (!SLOPES.includes(o.type) && o.type !== "plain-black" && !o.edges)
          ctx.stroke();
        if (ZONES.includes(o.type)) {
          ctx.setLineDash([]);
          const c = bounds(o);
          ctx.fillStyle = zoneColor;
          ctx.font = `bold ${unit * 0.5 * Math.min(...axes(o))}px system-ui`;
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText(
            o.type === "w-block" ? "W" : "R",
            X((c.left + c.right) / 2),
            Y((c.top + c.bottom) / 2),
          );
        }
        if (["grid", "ramp-grid", "scoop-grid", "hill-grid"].includes(o.type)) {
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
        if (o.edges) {
          // Only the chosen sides, on the block's own corners (polygon order: bottom left,
          // bottom right, top right, top left), so rotation and flips turn the outline too.
          const [bl, br, tr, tl] = p,
            at = (a: number[], b: number[], t: number) =>
              [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t],
            lines =
              o.edges === "edge"
                ? [[tl, tr]]
                : o.edges === "parallel"
                  ? [[tl, tr], [bl, br]]
                  : o.edges === "outer"
                    ? [[bl, tl, tr]]
                    : o.edges === "inner"
                      ? [[at(tl, bl, 0.25), tl, at(tl, tr, 0.25)]]
                      : o.edges === "three"
                        ? [[bl, tl, tr, br]] // left, top and right, the bottom open (#139)
                        : []; // none: the middle of a big shape, no line at all
          ctx.beginPath();
          for (const line of lines)
            line.forEach(([x, y], i) =>
              i ? ctx.lineTo(X(x), Y(y)) : ctx.moveTo(X(x), Y(y)),
            );
          ctx.strokeStyle = "#ffffff";
          ctx.lineWidth = 2;
          ctx.stroke();
        }
        if (SLOPES.includes(o.type)) {
          // the walking surface is the outline: a ramp's diagonal, a curve's arc (foot to top)
          ctx.beginPath();
          ctx.moveTo(X(p[0][0]), Y(p[0][1]));
          for (const [x, y] of [...p.slice(3).reverse(), p[2]]) ctx.lineTo(X(x), Y(y));
          ctx.strokeStyle = "#ffffff";
          ctx.lineWidth = 2;
          ctx.stroke();
        }
      }
      if (editing && (index === selected || group.includes(index)) && (o.type === "teleport-trigger" || o.type === "teleport-ring")) {
        // a selected teleport shows where it lands (docs/teleport.md rule 6): a dashed line to the
        // destination cell, or NO DESTINATION over the piece
        const to = destination(level.objects, o.target),
          [fx, fy] = pointOf(o, 0.5, 0.5);
        ctx.globalAlpha = 1;
        ctx.strokeStyle = ctx.fillStyle = "#b388ff";
        ctx.lineWidth = 2;
        if (to) {
          ctx.setLineDash([6, 4]);
          ctx.beginPath();
          ctx.moveTo(X(fx), Y(fy));
          ctx.lineTo(X(to[0] + 0.5), Y(to[1] + 0.5));
          ctx.stroke();
          ctx.setLineDash([]);
          ctx.strokeRect(X(to[0]), Y(to[1] + 1), unit, unit);
        } else {
          ctx.font = `bold ${Math.max(10, unit * 0.26)}px system-ui`;
          ctx.textAlign = "center";
          ctx.textBaseline = "bottom";
          ctx.fillText("NO DESTINATION", X(fx), Y(fy + 0.75));
        }
      }
      if (editing && (index === selected || group.includes(index))) {
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
      // what EDIT OBJECT changed, marked in the editor only: NT no touch, H hidden, W wall pass,
      // R roof pass, G and its group id
      const marks = [o.noTouch && "NT", o.hidden && "H", o.wallPass && "W", o.roofPass && "R", o.group && `G${o.group}`].filter(Boolean);
      if (editing && marks.length) {
        const b = bounds(o);
        ctx.globalAlpha = 1;
        ctx.fillStyle = "#ffffff";
        ctx.font = `bold ${unit * 0.28}px system-ui`;
        ctx.textAlign = "left";
        ctx.textBaseline = "top";
        ctx.fillText(marks.join(" "), X(b.left) + 3, Y(b.top) + 3);
      }
      ctx.restore();
    });
  if (editing && box) {
    ctx.save();
    ctx.strokeStyle = "#9aff6b";
    ctx.fillStyle = "#9aff6b22";
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 4]);
    const rect = [X(box.left), Y(box.top), (box.right - box.left) * unit, (box.top - box.bottom) * unit] as const;
    ctx.fillRect(...rect);
    ctx.strokeRect(...rect);
    ctx.restore();
  }
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
    // held at a wall by a W, the drawn avatar (wider than the body) stops at the wall face
    const x = X(
        state.wall === null
          ? state.x + SIZE / 2
          : Math.min(state.x + SIZE / 2, state.wall - avatar / 2),
      ),
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
      // the cube's turn (src/spin.ts, #120), kept per run; reduced motion keeps it upright
      let turn = { angle: 0, side: 0 };
      if (!reduced) {
        let s = SPINS.get(state);
        if (!s) SPINS.set(state, (s = newSpin()));
        turn = spinAt(s, state);
      }
      if (state.mode === "square" && skin) {
        // A skin (docs/skins.md) replaces the square only: pogo shares the branch below and keeps
        // it. Its own fitted rectangle keeps the cube's anchoring (skinBox), drawn pixel for pixel.
        // On its side the turned image stands in the swapped box, so its feet stay on the ground.
        const upright = skinBox(state, skin.width, skin.height, avatar),
          sideways = skinBox(state, skin.height, skin.width, avatar),
          cx = (upright.left + upright.right) / 2,
          sx = (sideways.left + sideways.right) / 2,
          cy = (upright.bottom + upright.top) / 2,
          sy = (sideways.bottom + sideways.top) / 2,
          flip = state.gravity > 0 ? -1 : 1,
          sw = ((upright.right - upright.left) * unit) / k,
          sh = ((upright.top - upright.bottom) * unit) / k;
        if (state.gravity > 0) ctx.scale(1, -1);
        ctx.translate(
          (X(cx + (sx - cx) * turn.side) - x) / k,
          ((Y(cy + (sy - cy) * turn.side) - y) / k) * flip,
        );
        if (turn.angle) ctx.rotate(turn.angle);
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(skin.image, -sw / 2, -sh / 2, sw, sh);
      } else if (state.mode === "square" || state.mode === "pogo") {
        if (state.gravity > 0) ctx.scale(1, -1);
        if (turn.angle) ctx.rotate(turn.angle);
        const a = SIZE * unit;
        ctx.fillStyle = color;
        ctx.strokeStyle = "#fff";
        ctx.lineWidth = 2;
        ctx.fillRect(-a / 2, -a / 2, a, a);
        ctx.strokeRect(-a / 2, -a / 2, a, a);
        ctx.fillStyle = "#101825";
        if (state.mode === "pogo") {
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
      } else if (state.mode === "door") {
        if (state.gravity > 0) ctx.scale(1, -1);
        const a = SIZE * unit;
        ctx.fillStyle = color;
        ctx.strokeStyle = "#fff";
        ctx.lineWidth = 2;
        ctx.fillRect(-a * 0.36, -a / 2, a * 0.72, a);
        ctx.strokeRect(-a * 0.36, -a / 2, a * 0.72, a);
        ctx.strokeStyle = "#101825";
        ctx.strokeRect(-a * 0.22, -a * 0.36, a * 0.44, a * 0.32);
        ctx.fillStyle = "#101825";
        ctx.fillRect(a * 0.16, a * 0.08, a * 0.13, a * 0.09);
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
      } else if (state.mode === "croissant") {
        // a crescent lying on its horns; upside down it hangs from the ceiling by them
        if (state.gravity > 0) ctx.scale(1, -1);
        const r = (SIZE * unit) / 2;
        ctx.fillStyle = color;
        ctx.strokeStyle = "#fff";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(0, r * 0.2, r, Math.PI * 0.9, Math.PI * 2.1);
        ctx.arc(0, r * 0.7, r * 0.62, Math.PI * 2.02, Math.PI * 0.98, true);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.strokeStyle = "#101825";
        for (const a of [-0.3, 0, 0.3]) {
          const t = -Math.PI / 2 + a;
          ctx.beginPath();
          ctx.moveTo(Math.cos(t) * r * 0.45, r * 0.2 + Math.sin(t) * r * 0.45);
          ctx.lineTo(Math.cos(t) * r * 0.95, r * 0.2 + Math.sin(t) * r * 0.95);
          ctx.stroke();
        }
      } else if (state.mode === "angle") {
        // A dart that points along its own 45 degree line: up while held, down when released.
        ctx.rotate(-Math.atan2(state.vy, SPEED * state.speed));
        ctx.fillStyle = color;
        ctx.strokeStyle = "#fff";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(unit * 0.45, 0);
        ctx.lineTo(-unit * 0.3, -unit * 0.22);
        ctx.lineTo(-unit * 0.3, unit * 0.22);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
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
