import type {
  GameMode,
  GameState,
  Level,
  ObjectType,
  Piece,
  Point,
  RunEffects,
  Transform,
} from "./types.ts";
import { recordingFor } from "./recordings.ts";
// Quarter-block clearance makes a two-block ledge landable, not just reachable at one instant.
export const SPEED = 5,
  GRAVITY = 16,
  JUMP = Math.sqrt(2 * GRAVITY * 2.25),
  SIZE = 0.64,
  STEP = 1 / 120,
  // a gravity flip from a portal or a dark blue orb starts you already falling, as fast as a
  // one-block drop ends, so the flip carries you instead of floating (#94)
  FALL = Math.sqrt(2 * GRAVITY);
export const DEATH_INSET = 0.12; // 0.40-block hazard box; full size still supports landings.
// Spikes reach further into the body than walls do: the kid asked for bigger hitboxes, but not
// pixel-exact, so a spike catches more of the cube while a graze on its very edge still lives.
// Walls and blocks keep DEATH_INSET; a box past the body would kill a run standing on a block.
export const SPIKE_INSET = 0.06;
export const MAX_LENGTH = 600;
// Zones: invisible in play, never touched themselves. While the player touches a W, hitting the
// SIDE of a block or ramp does not kill and the player goes through it; while touching an R,
// hitting it head first does not kill and the player rises through. Laid over visible blocks they
// make hidden passages. Spikes still kill inside a zone.
export const ZONES = ["w-block", "r-block"];
export const BLOCKS = ["block", "grid", "black", "outline", "plain-black"];
// Curves are ramps whose slope is a quarter circle, walked and outlined like a ramp: the scoop
// bends up like a quarter pipe (flat at the bottom, vertical at the top), the hill bulges out
// (vertical at the bottom, flat at the top, so it is run downhill or met from its flat side).
export const CURVES = ["scoop", "scoop-grid", "scoop-black", "hill", "hill-grid", "hill-black"];
export const RAMPS = ["ramp", "ramp-grid", "ramp-black"];
// anything walked as a slope: the three ramps and the six curves
export const SLOPES = [...RAMPS, ...CURVES];
// The arc from the ramp's top corner (1, 1) back to its foot (0, 0), in 8 segments; the
// endpoints are exact so a curve meets the grid where a ramp does.
const ARC = 8;
const curve = (type: string): number[][] => {
  const scoop = type.startsWith("scoop"),
    inner = Array.from({ length: ARC - 1 }, (_, i) => {
      const t = ((i + 1) / ARC) * (Math.PI / 2);
      // scoop: centre (0, 1), from (1, 1) round to (0, 0); hill: centre (1, 0), same ends
      return scoop ? [Math.cos(t), 1 - Math.sin(t)] : [1 - Math.sin(t), Math.cos(t)];
    });
  return [[0, 0], [1, 0], [1, 1], ...inner];
};
export const SPIKES = ["spike", "half", "small", "quarter"];
// Speed portals scale forward speed only; mode and gravity carry through. No portal is 1x, so
// every level made before them plays exactly as it did.
export const SPEEDS: Record<string, number> = {
  "speed-slow": 0.8,
  "speed-normal": 1,
  "speed-fast": 1.25,
  "speed-faster": 1.5,
};
export const PORTALS = [
  "plane",
  "square",
  "wheel",
  "pogo",
  "angle",
  "croissant",
  "gravity-up",
  "gravity-down",
  ...Object.keys(SPEEDS),
];
// Modes that ride surfaces instead of dying on them: floor, ceiling and block faces are safe,
// walls still kill.
export const SOFT = ["plane", "pogo", "angle"];
// Coins are picked up by touching them; a level holds at most MAX_COINS. Triggers are invisible
// and never touched in play: each fires once per run when the player's x passes its x, and works
// on every piece whose group is its target. Triggers carry no group themselves, so nothing can
// move a trigger and the order they fire in is always the authored one.
export const MAX_COINS = 10;
export const TRIGGERS = ["move-trigger", "color-trigger"];
export const MAX_GROUP = 99;
export const MAX_TRIGGER_TIME = 30; // seconds, so every move and fade finishes inside a run
export const TYPES = [...BLOCKS, ...ZONES, ...SPIKES, ...PORTALS, ...SLOPES, "ring", "coin", ...TRIGGERS];
// Ids that were renamed after they had been stored. validateLevel accepts the old id and returns
// the new one, so an old save, share code or link still loads; nothing writes the old id again.
export const LEGACY_TYPES: Partial<Record<string, ObjectType>> = {
  jumper: "pogo", // 2026-09-29, the stored id followed the POGO label (#33)
};
export const SCALABLE = [...BLOCKS, ...ZONES, ...SPIKES, ...SLOPES]; // pieces that take a scale; rings and portals stay 1x
// Blocks drawn with a white outline take an edges field (types.ts Edges); NO BORDER has none.
export const OUTLINED = ["block", "grid", "black", "outline"];
export const EDGES = ["edge", "parallel", "outer", "inner", "none"];
// A ring with no bounce field is the original: JUMP, a 2.25 block peak. A set bounce is the peak
// height in blocks, so the launch speed is the one that reaches it under level gravity.
export const RING_BOUNCE = 2.25;
export const ringSpeed = (o: Piece) =>
  o.bounce === undefined ? JUMP : Math.sqrt(2 * GRAVITY * o.bounce);
export const levelHeight = (level: Level) => level.height ?? 7;
export const COIN_RADIUS = 0.3; // a coin is a disc in the middle of its cell
export const coinCount = (level: Level) => {
  let n = 0;
  for (const o of level.objects) if (o.type === "coin") n++;
  return n;
};
// A dash orb carries the run the way it points. The trail only runs forward, so an orb aimed
// backward dashes the mirror way forward, and the aim is held to 70 degrees off straight ahead.
export const DASH_LIMIT = 70;
export const dashClimb = (o: Piece) => {
  const turn = ((o.rotation % 360) + 540) % 360 - 180,
    ahead = Math.abs(turn) > 90 ? Math.sign(turn) * (180 - Math.abs(turn)) : turn;
  return Math.tan((Math.max(-DASH_LIMIT, Math.min(DASH_LIMIT, ahead)) * Math.PI) / 180);
};
export function object(type: ObjectType, x: number, y = 0): Piece {
  return { type, x, y, rotation: 0, flipX: false, flipY: false };
}
// A piece's unturned footprint; it turns and flips about the middle of this box.
export function pieceSize(o: Piece) {
  const portal = PORTALS.includes(o.type),
    scale = o.type === "small" ? 2 / 3 : o.type === "quarter" ? 0.25 : 1;
  return {
    w: portal ? 0.6 : scale,
    h: portal ? 2.5 : o.type === "half" ? 0.5 : scale,
  };
}
export function polygon(o: Piece): Point[] {
  const { w, h } = pieceSize(o);
  const points = CURVES.includes(o.type)
    ? curve(o.type)
    : RAMPS.includes(o.type)
    ? [
        [0, 0],
        [1, 0],
        [1, 1],
      ]
    : o.type === "ring" || o.type === "coin"
      ? Array.from({ length: 16 }, (_, i) => [
          0.5 + (o.type === "coin" ? COIN_RADIUS : 0.45) * Math.cos((i * Math.PI) / 8),
          0.5 + (o.type === "coin" ? COIN_RADIUS : 0.45) * Math.sin((i * Math.PI) / 8),
        ])
      : SPIKES.includes(o.type)
        ? [
            [0, 0],
            [w, 0],
            [w / 2, h],
          ]
        : [
            [0, 0],
            [w, 0],
            [w, h],
            [0, h],
          ];
  const a = (o.rotation * Math.PI) / 180,
    quarter = o.rotation % 90 === 0,
    // quarter turns stay exactly axis-aligned (no 6e-17 drift into saved geometry); any other
    // angle is a real rotation.
    c = quarter ? Math.round(Math.cos(a)) : Math.cos(a),
    s = quarter ? Math.round(Math.sin(a)) : Math.sin(a);
  // A scaled piece grows from its own base, in its own rotated frame: a floor spike stays on
  // the floor and grows up, a ceiling spike stays on the ceiling and grows down, a block grows
  // up and sideways. At scale 1 the shift is zero and the shape is the legacy one.
  const k = SCALABLE.includes(o.type) ? (o.scale ?? 1) : 1;
  return points.map(([x, y]) => {
    x = (x - w / 2) * k * (o.flipX ? -1 : 1);
    y = (y - h / 2) * k * (o.flipY ? -1 : 1) + ((k - 1) * h) / 2;
    return [o.x + w / 2 + x * c - y * s, o.y + h / 2 + x * s + y * c];
  });
}
// The collision test only holds for convex shapes. A scoop curves inward, so it is checked as a
// fan of thin triangles from its corner, which together are exactly its area; every other piece
// is convex and is its own single part.
export function parts(o: Piece): Point[][] {
  const p = polygon(o);
  if (!o.type.startsWith("scoop")) return [p];
  const rim = [p[2], ...p.slice(3), p[0]];
  return rim.slice(1).map((q, i) => [p[1], rim[i], q]);
}
export function bounds(o: Piece) {
  const p = polygon(o),
    xs = p.map((p) => p[0]),
    ys = p.map((p) => p[1]);
  return {
    left: Math.min(...xs),
    right: Math.max(...xs),
    bottom: Math.min(...ys),
    top: Math.max(...ys),
  };
}
// Both renderer and collision use the transformed polygon, including half spikes.
export function intersects(a: Point[], b: Point[]) {
  for (const p of [a, b])
    for (let i = 0; i < p.length; i++) {
      const next = p[(i + 1) % p.length],
        axis = [p[i][1] - next[1], next[0] - p[i][0]];
      const aa = a.map((v) => v[0] * axis[0] + v[1] * axis[1]),
        bb = b.map((v) => v[0] * axis[0] + v[1] * axis[1]);
      if (
        Math.max(...aa) <= Math.min(...bb) + 0.00001 ||
        Math.max(...bb) <= Math.min(...aa) + 0.00001
      )
        return false;
    }
  return true;
}
// The per-run side of coins and triggers, or nothing for a level without them. A level with a
// move trigger is played on the run's own copy of its pieces, so moves never reach the authored
// level, a saved draft or a built-in course; a restart builds a fresh copy from the authored one.
export function effects(level: Level): { fx: RunEffects; level: Level } | null {
  const n = level.objects.length,
    triggers: number[] = [],
    groups = new Map<number, number[]>();
  let coinTotal = 0,
    moves = false;
  for (let i = 0; i < n; i++) {
    const o = level.objects[i];
    if (o.type === "coin") coinTotal++;
    if (TRIGGERS.includes(o.type)) {
      triggers.push(i);
      if (o.type === "move-trigger") moves = true;
    }
    if (o.group !== undefined) {
      const members = groups.get(o.group);
      if (members) members.push(i);
      else groups.set(o.group, [i]);
    }
  }
  if (!coinTotal && !triggers.length) return null;
  return {
    fx: {
      coinTotal,
      coins: 0,
      got: new Uint8Array(n),
      triggers,
      fired: new Uint8Array(n),
      groups,
      move: new Float64Array(n * 6),
      movers: [],
      tint: new Float64Array(n * 8),
      fade: new Float64Array(n),
      tinted: new Uint8Array(n),
    },
    level: moves ? { ...level, objects: level.objects.map((o) => ({ ...o })) } : level,
  };
}
export function createState(level: Level): GameState {
  const run = effects(level);
  return {
    ...baseState(run ? run.level : level),
    ...(run && { fx: run.fx }),
  };
}
function baseState(level: Level): GameState {
  return {
    x: 1,
    y: 0,
    vy: 0,
    mode: "square",
    gravity: -1,
    speed: 1,
    wall: null,
    dash: null,
    inputHeld: false,
    grounded: true,
    status: "playing",
    time: 0,
    touchingPortals: [],
    usedRings: [],
    level,
  };
}
export function ringReady(s: GameState, o: Piece, index: number) {
  const dx = Math.max(s.x - (o.x + 0.5), 0, o.x + 0.5 - s.x - SIZE);
  const dy = Math.max(s.y - (o.y + 0.5), 0, o.y + 0.5 - s.y - SIZE);
  return !o.noTouch && !s.usedRings.includes(index) && dx * dx + dy * dy <= 0.6 * 0.6;
}
// Moves and fades follow the run's own clock (state.time), never the wall clock, so pausing
// freezes them and a replay of the same input sees the same frames.
function place(s: GameState, fx: RunEffects, i: number) {
  const m = i * 6,
    p = s.level.objects[i],
    t = fx.move[m + 5] > 0 ? Math.min(1, (s.time - fx.move[m + 4]) / fx.move[m + 5]) : 1;
  p.x = fx.move[m] + fx.move[m + 2] * t;
  p.y = fx.move[m + 1] + fx.move[m + 3] * t;
  return t >= 1;
}
function moveAll(s: GameState, fx: RunEffects) {
  for (let k = 0; k < fx.movers.length; ) {
    if (!place(s, fx, fx.movers[k])) k++;
    else {
      fx.movers[k] = fx.movers[fx.movers.length - 1];
      fx.movers.pop();
    }
  }
}
const SCRATCH = new Float64Array(4);
// The colour laid over an object right now, as r, g, b (0 to 255) and how much of the piece it
// covers (0 none, 1 all), or null when no colour trigger has reached it. A fade runs from what
// was showing when it started, so a new colour picks up from a half-finished one.
export function tintOf(fx: RunEffects, i: number, time: number, out = SCRATCH) {
  if (!fx.tinted[i]) return null;
  const c = i * 8,
    d = fx.fade[i],
    p = d > 0 ? Math.min(1, Math.max(0, (time - fx.tint[c + 7]) / d)) : 1,
    from = fx.tint[c + 3],
    a = from + (1 - from) * p;
  for (let k = 0; k < 3; k++)
    out[k] = a > 0 ? (fx.tint[c + k] * from * (1 - p) + fx.tint[c + 4 + k] * p) / a : fx.tint[c + 4 + k];
  out[3] = a;
  return out;
}
// Fires every trigger the player's x has reached this step, in authored order, however many that
// is and wherever they are on screen. A new command on a piece starts from where that piece is
// (or how it looks) right now and replaces the one it had.
export function runTriggers(s: GameState, fx: RunEffects) {
  if (fx.movers.length) moveAll(s, fx);
  for (let k = 0; k < fx.triggers.length; k++) {
    const t = fx.triggers[k];
    if (fx.fired[t]) continue;
    const o = s.level.objects[t];
    if (s.x < o.x) continue;
    fx.fired[t] = 1;
    const members = o.target === undefined ? undefined : fx.groups.get(o.target);
    if (!members) continue;
    for (let j = 0; j < members.length; j++) {
      const i = members[j];
      if (o.type === "move-trigger") {
        const p = s.level.objects[i],
          m = i * 6;
        fx.move[m] = p.x;
        fx.move[m + 1] = p.y;
        fx.move[m + 2] = o.moveX ?? 0;
        fx.move[m + 3] = o.moveY ?? 0;
        fx.move[m + 4] = s.time;
        fx.move[m + 5] = o.duration ?? 0;
        const done = place(s, fx, i),
          at = fx.movers.indexOf(i);
        if (done && at >= 0) fx.movers.splice(at, 1);
        else if (!done && at < 0) fx.movers.push(i);
      } else {
        const c = i * 8,
          hex = o.color ?? "#ffd166",
          now = tintOf(fx, i, s.time);
        for (let n = 0; n < 3; n++) {
          fx.tint[c + 4 + n] = parseInt(hex.slice(1 + n * 2, 3 + n * 2), 16);
          fx.tint[c + n] = now ? now[n] : fx.tint[c + 4 + n];
        }
        fx.tint[c + 3] = now ? now[3] : 0;
        fx.tint[c + 7] = s.time;
        fx.fade[i] = o.duration ?? 0;
        fx.tinted[i] = 1;
      }
    }
  }
}
// Height of the actual triangle over the player's full horizontal footprint.
export function rampSurface(
  o: Piece,
  left: number,
  right: number,
  upper: boolean,
) {
  const p = polygon(o),
    heights: number[] = [];
  for (let i = 0; i < p.length; i++) {
    const [ax, ay] = p[i],
      [bx, by] = p[(i + 1) % p.length];
    if (ax === bx) continue;
    const lo = Math.max(left, Math.min(ax, bx)),
      hi = Math.min(right, Math.max(ax, bx));
    if (hi <= lo + 0.00001) continue;
    for (const x of [lo, hi])
      heights.push(ay + ((by - ay) * (x - ax)) / (bx - ax));
  }
  return heights.length
    ? upper
      ? Math.max(...heights)
      : Math.min(...heights)
    : null;
}
// The croissant's teleport (#97): straight across to the first surface the new gravity falls
// toward, over the player's whole width, or to the level's edge when nothing is in the way. Only
// what it could stand on stops it; spikes, rings, portals and zones are passed through.
export function across(s: GameState) {
  const up = s.gravity > 0,
    left = s.x,
    right = s.x + SIZE;
  let y = up ? levelHeight(s.level) - SIZE : 0;
  for (const o of s.level.objects) {
    if (o.layer === "background" || o.noTouch) continue;
    if (!(BLOCKS.includes(o.type) || SLOPES.includes(o.type))) continue;
    const b = bounds(o);
    if (b.right <= left + 0.001 || b.left >= right - 0.001) continue;
    const face = rampSurface(o, left, right, !up);
    if (face === null) continue;
    if (up && face >= s.y + SIZE - 0.001) y = Math.min(y, face - SIZE);
    if (!up && face <= s.y + 0.001) y = Math.max(y, face);
  }
  return y;
}
function playerPolygon(s: GameState, inset = 0): Point[] {
  const left = s.x + inset,
    right = s.x + SIZE - inset,
    bottom = s.y + inset,
    top = s.y + SIZE - inset;
  return [
    [left, bottom],
    [right, bottom],
    [right, top],
    [left, top],
  ];
}
export function step(
  s: GameState,
  held: boolean,
  dt = STEP,
  tapped = held && !s.inputHeld,
) {
  if (s.status !== "playing") return s;
  s.inputHeld = held;
  const oldY = s.y,
    oldX = s.x,
    wasGrounded = s.grounded,
    height = levelHeight(s.level);
  // A dash orb starts on a hold, not only a fresh tap, and lasts until the hold ends.
  if (!held) s.dash = null;
  const ring = s.level.objects.findIndex(
    (o, i) => o.type === "ring" && (o.dash ? held : tapped) && ringReady(s, o, i),
  );
  if (ring >= 0) {
    s.usedRings.push(ring);
    const o = s.level.objects[ring];
    // a gravity ring flips you from wherever you are in the air and you drop the new way at once
    // (#94); the green one bounces you off the new gravity, a yellow ring jump turned over (#95)
    // the yellow dash orb flips gravity as the dash starts
    if (o.dash) {
      s.dash = dashClimb(o);
      if (o.flipsGravity) s.gravity *= -1;
    } else if (o.flipsGravity) {
      s.gravity *= -1;
      s.vy = o.boost ? -s.gravity * ringSpeed(o) : s.gravity * FALL;
    } else s.vy = -s.gravity * ringSpeed(o);
    s.grounded = false;
  }
  if (ring < 0 && s.mode === "wheel" && s.grounded && tapped) {
    s.gravity *= -1;
    s.vy = 0;
    s.grounded = false;
  }
  if (ring < 0 && s.mode === "croissant" && s.grounded && tapped) {
    s.gravity *= -1;
    s.y = across(s);
    s.vy = 0;
  }
  if (
    ((s.mode === "square" || s.mode === "pogo") && s.grounded && held) ||
    (s.mode === "pogo" && tapped)
  ) {
    s.vy = -s.gravity * JUMP;
    s.grounded = false;
  }
  // Angle: a true 45 degrees, so the climb and the dive both move up or down exactly as fast as
  // the trail moves forward. Gravity only picks which way "up" is.
  const forward = SPEED * s.speed;
  if (s.mode === "angle") s.vy = -s.gravity * (held ? forward : -forward);
  if (s.dash !== null) s.vy = s.dash * forward;
  const acceleration =
    s.dash !== null
      ? 0
      : s.mode === "plane"
      ? -s.gravity * (held ? 14 : -12)
      : s.mode === "angle"
        ? 0
        : s.gravity * GRAVITY;
  s.x += forward * dt;
  s.time += dt;
  s.y += s.vy * dt + (acceleration * dt * dt) / 2;
  s.vy += acceleration * dt;
  if (s.mode === "plane") s.vy = Math.max(-4, Math.min(4, s.vy));
  // before any contact, so this step's collisions meet pieces where triggers have put them
  if (s.fx) runTriggers(s, s.fx);
  s.grounded = false;
  if (s.y <= 0) {
    s.y = 0;
    s.vy = 0;
    s.grounded = s.gravity < 0;
    if (s.gravity > 0 && !SOFT.includes(s.mode)) s.status = "dead";
  }
  if (s.y + SIZE > height) {
    if (s.gravity > 0 || SOFT.includes(s.mode)) {
      s.y = height - SIZE;
      s.vy = 0;
      s.grounded = s.gravity > 0;
    } else s.status = "dead";
  }
  s.wall = null;
  const touching = [],
    body = playerPolygon(s),
    inZone = (type: string) =>
      s.level.objects.some((o) => o.type === type && intersects(body, polygon(o))),
    inW = inZone("w-block"),
    inR = inZone("r-block");
  for (let i = 0; i < s.level.objects.length; i++) {
    const o = s.level.objects[i];
    if (o.layer === "background" || o.noTouch) continue;
    if (o.type === "ring" || ZONES.includes(o.type) || TRIGGERS.includes(o.type)) continue;
    const reach = 2 * (o.scale ?? 1); // a scaled piece is wider than its anchor cell
    if (o.x > s.x + reach || o.x < s.x - reach) continue;
    if (o.type === "coin") {
      // the whole body picks a coin up, like it touches a portal; a coin never blocks or kills
      if (s.fx && !s.fx.got[i] && intersects(body, polygon(o))) {
        s.fx.got[i] = 1;
        s.fx.coins++;
      }
      continue;
    }
    if (PORTALS.includes(o.type)) {
      const player = playerPolygon(s);
      if (intersects(player, polygon(o))) {
        touching.push(i);
        if (!s.touchingPortals.includes(i)) {
          if (o.type in SPEEDS) s.speed = SPEEDS[o.type];
          else if (o.type.startsWith("gravity-")) {
            const flip = s.gravity !== (o.type === "gravity-up" ? 1 : -1);
            s.gravity = o.type === "gravity-up" ? 1 : -1;
            s.vy = flip ? s.gravity * FALL : 0;
            s.grounded = false;
          } else {
            s.mode = o.type as GameMode;
            if (o.type === "plane") {
              s.y = Math.max(0.5, Math.min(height - SIZE - 0.5, s.y));
              s.vy = -s.gravity * 3;
              s.grounded = false;
            }
          }
        }
      }
      continue;
    }
    const p = polygon(o),
      b = bounds(o),
      // a block at a non-quarter angle is supported like a ramp: along its real edges.
      ramp = SLOPES.includes(o.type) || (BLOCKS.includes(o.type) && o.rotation % 90 !== 0),
      safeSolid = SOFT.includes(s.mode) && (BLOCKS.includes(o.type) || ramp);
    if (ramp) {
      for (const upper of [true, false]) {
        if (!(safeSolid || (upper ? s.gravity < 0 : s.gravity > 0))) continue;
        const surface = rampSurface(o, s.x, s.x + SIZE, upper);
        if (surface === null) continue;
        const oldSurface = rampSurface(o, oldX, oldX + SIZE, upper);
        const oldEdge = oldY + (upper ? 0 : SIZE),
          edge = s.y + (upper ? 0 : SIZE);
        const direction = upper ? 1 : -1;
        const following =
          wasGrounded &&
          s.vy * s.gravity >= 0 &&
          oldSurface !== null &&
          Math.abs(oldEdge - oldSurface) < 0.02;
        const crossing =
          s.vy * direction <= 0 &&
          direction * (oldEdge - surface) >= -(forward * dt + 0.015) &&
          direction * (edge - surface) <= 0;
        // A curve is climbed from its side (#84): where the run first meets it, the curve starts
        // at the feet, so the run rides up however steep it gets, instead of hitting it as a wall.
        // A flipped hill's vertical side starts a whole block up and is still a wall.
        const entry = CURVES.includes(o.type)
            ? rampSurface(o, Math.max(s.x, b.left), Math.max(s.x, b.left) + 1e-4, upper)
            : null,
          climbing =
            entry !== null &&
            direction * (oldEdge - entry) >= -(forward * dt + 0.015) &&
            direction * (edge - surface) <= 0;
        if (following || crossing || climbing) {
          s.y = surface - (upper ? 0 : SIZE);
          s.vy = 0;
          s.grounded = upper ? s.gravity < 0 : s.gravity > 0;
        }
      }
    }
    // Modes that ride surfaces slide along a block's head face, and anyone touching an R bumps
    // it: the rise stops at the face and gravity takes over, nobody dies.
    const headSlide = safeSolid || ((inR || o.roofPass) && BLOCKS.includes(o.type));
    if (
      BLOCKS.includes(o.type) &&
      o.rotation % 90 === 0 &&
      s.x + SIZE > b.left + 0.001 &&
      s.x < b.right - 0.001
    ) {
      if (
        (s.gravity < 0 || headSlide) &&
        s.vy <= 0 &&
        oldY >= b.top - 0.015 &&
        s.y <= b.top
      ) {
        s.y = b.top;
        s.vy = 0;
        s.grounded = s.gravity < 0;
      } else if (
        (s.gravity > 0 || headSlide) &&
        s.vy >= 0 &&
        oldY + SIZE <= b.bottom + 0.015 &&
        s.y + SIZE >= b.bottom
      ) {
        s.y = b.bottom - SIZE;
        s.vy = 0;
        s.grounded = s.gravity > 0;
      }
    }
    const player = playerPolygon(s, SPIKES.includes(o.type) ? SPIKE_INSET : DEATH_INSET);
    if (parts(o).some((part) => intersects(player, part))) {
      // The trail only moves forward, so a hazard box that was clear of the piece's left edge
      // came in from the side: a wall. Touching a W, a wall stops the run instead of crashing it.
      // The hazard box is held against the wall's face, the run waits there, and a jump that
      // clears the wall carries on. Spikes still kill.
      const fromSide = oldX + SIZE - DEATH_INSET <= b.left + 0.001;
      // Vertical support is resolved above. Wall impacts kill in every mode.
      if ((inW || o.wallPass) && fromSide && !SPIKES.includes(o.type)) {
        s.x = b.left - SIZE + DEATH_INSET;
        s.wall = b.left;
      } else if (headSlide && oldY + SIZE <= b.bottom + 0.015 && s.vy > 0) {
        s.y = b.bottom - SIZE;
        s.vy = 0;
      } else s.status = "dead";
    }
  }
  s.touchingPortals = touching;
  if (s.status === "playing" && s.x >= s.level.length) s.status = "complete";
  return s;
}
export function validateLevel(input: unknown): Level {
  // The assertion only gives names to the shape; every persisted field is checked below.
  const raw = input as Level;
  if (
    !raw ||
    typeof raw.name !== "string" ||
    raw.name.length > 40 ||
    !Number.isFinite(raw.length) ||
    raw.length < 20 ||
    raw.length > MAX_LENGTH ||
    !Array.isArray(raw.objects) ||
    raw.objects.length > 600
  )
    throw Error("Invalid level");
  const height = levelHeight(raw);
  if (
    !Number.isInteger(height) ||
    height < 7 ||
    height > 40 ||
    (raw.song !== undefined &&
      (!Number.isInteger(raw.song) ||
        raw.song < 0 ||
        (raw.song > 108 && !recordingFor(raw.song))))
  )
    throw Error("Invalid level settings");
  // Renamed ids are mapped on the copy before any check, so a legacy piece is measured and
  // bounded as what it is now; the input itself is never written to.
  const level = structuredClone(raw);
  for (const o of level.objects) {
    if (o && typeof o === "object" && LEGACY_TYPES[o.type])
      o.type = LEGACY_TYPES[o.type]!;
    if (
      !o ||
      !TYPES.includes(o.type) ||
      !Number.isFinite(o.x) ||
      !Number.isFinite(o.y) ||
      o.x < 3 ||
      o.x > raw.length - 2 ||
      o.y < -0.5 ||
      o.y > height - 1 ||
      (SCALABLE.includes(o.type) || o.dash === true // a dash orb aims at any angle
        ? !(Number.isFinite(o.rotation) && o.rotation >= 0 && o.rotation < 360)
        : ![0, 90, 180, 270].includes(o.rotation)) ||
      typeof o.flipX !== "boolean" ||
      typeof o.flipY !== "boolean"
    )
      throw Error("Invalid object");
    if (
      o.scale !== undefined &&
      (!Number.isFinite(o.scale) ||
        o.scale < 0.25 ||
        o.scale > 4 ||
        !SCALABLE.includes(o.type))
    )
      throw Error("Invalid scale");
    if (
      o.color !== undefined &&
      ((o.type !== "ring" && o.type !== "color-trigger") ||
        typeof o.color !== "string" ||
        !/^#[\da-f]{6}$/i.test(o.color))
    )
      throw Error("Invalid ring colour");
    if (
      o.bounce !== undefined &&
      (o.type !== "ring" ||
        !Number.isFinite(o.bounce) ||
        o.bounce < 0.25 ||
        o.bounce > 10)
    )
      throw Error("Invalid ring bounce");
    if (
      o.flipsGravity !== undefined &&
      (o.type !== "ring" || o.flipsGravity !== true || o.bounce !== undefined)
    )
      throw Error("Invalid gravity ring");
    if (o.boost !== undefined && (o.boost !== true || !o.flipsGravity))
      throw Error("Invalid gravity ring");
    if (
      o.dash !== undefined &&
      (o.type !== "ring" || o.dash !== true || o.boost || o.bounce !== undefined)
    )
      throw Error("Invalid dash orb");
    const trigger = TRIGGERS.includes(o.type);
    // a coin is always there to pick up, so it can be hidden (a secret coin) but never no-touch
    if (o.noTouch !== undefined && (o.noTouch !== true || ZONES.includes(o.type) || trigger || o.type === "coin"))
      throw Error("Invalid no touch");
    if (o.hidden !== undefined && (o.hidden !== true || ZONES.includes(o.type) || trigger))
      throw Error("Invalid hidden");
    const groupId = (v: unknown) => Number.isInteger(v) && (v as number) >= 1 && (v as number) <= MAX_GROUP;
    if (o.group !== undefined && (trigger || !groupId(o.group)))
      throw Error("Invalid group");
    if (o.target !== undefined && (!trigger || !groupId(o.target)))
      throw Error("Invalid trigger group");
    // whole blocks, and never further than the level is long or tall
    for (const [key, limit] of [["moveX", raw.length], ["moveY", height]] as const) {
      const v = o[key];
      if (
        v !== undefined &&
        (o.type !== "move-trigger" || !Number.isInteger(v) || Math.abs(v) > limit)
      )
        throw Error("Invalid move");
    }
    if (
      o.duration !== undefined &&
      (!trigger ||
        !Number.isFinite(o.duration) ||
        o.duration < 0 ||
        o.duration > MAX_TRIGGER_TIME)
    )
      throw Error("Invalid trigger time");
    if (
      o.wallPass !== undefined &&
      (o.wallPass !== true || !(BLOCKS.includes(o.type) || SLOPES.includes(o.type)))
    )
      throw Error("Invalid wall pass");
    if (o.roofPass !== undefined && (o.roofPass !== true || !BLOCKS.includes(o.type)))
      throw Error("Invalid roof pass");
    if (
      o.edges !== undefined &&
      (!OUTLINED.includes(o.type) || !EDGES.includes(o.edges))
    )
      throw Error("Invalid block edges");
    if (o.layer !== undefined && o.layer !== "background")
      throw Error("Invalid layer");
    if (o.layer === "background" && !BLOCKS.includes(o.type) && !ZONES.includes(o.type))
      throw Error("Only blocks go in the background");
    if (raw.height !== undefined && bounds(o).top > height + 0.00001)
      throw Error("Object above ceiling");
  }
  // every reader comes through here (saves, share codes, copies), so the cap holds for all of them
  if (coinCount(level) > MAX_COINS)
    throw Error(`A level can hold up to ${MAX_COINS} coins.`);
  return level;
}
export function transform(o: Piece, action: Transform, amount = 1) {
  if (action === "left") o.x -= amount;
  if (action === "right") o.x += amount;
  if (action === "up") o.y += amount;
  if (action === "down") o.y -= amount;
  if (action === "cw") o.rotation = (o.rotation + 270) % 360;
  if (action === "ccw") o.rotation = (o.rotation + 90) % 360;
  if (action === "flipX") o.flipX = !o.flipX;
  if (action === "flipY") o.flipY = !o.flipY;
  o.x = Math.round(o.x * 20) / 20;
  o.y = Math.round(o.y * 20) / 20;
  return o;
}
export function duplicateObject(level: Level, index: number) {
  const source = level.objects[index];
  if (!source) throw Error("Select an object to copy.");
  if (level.objects.length >= 600)
    throw Error("This trail has reached 600 objects.");
  const copy = structuredClone(source),
    b = bounds(copy),
    stride = Math.max(1, b.right - b.left);
  do {
    copy.x = Math.round((copy.x + stride) * 20) / 20;
    if (copy.x > level.length - 2)
      throw Error(
        "No room to the right. Move the object or lengthen the trail.",
      );
  } while (
    level.objects.some(
      (o) => o.layer === copy.layer && intersects(polygon(copy), polygon(o)),
    )
  );
  validateLevel({ ...level, objects: [...level.objects, copy] });
  return copy;
}
