import type {
  GameMode,
  GameState,
  Level,
  ObjectType,
  Piece,
  Point,
  Transform,
} from "./types.ts";
import { recordingFor } from "./recordings.ts";
// Quarter-block clearance makes a two-block ledge landable, not just reachable at one instant.
export const SPEED = 5,
  GRAVITY = 16,
  JUMP = Math.sqrt(2 * GRAVITY * 2.25),
  SIZE = 0.64,
  STEP = 1 / 120;
export const DEATH_INSET = 0.12; // 0.40-block hazard box; full size still supports landings.
export const MAX_LENGTH = 600;
// Zones: invisible in play, never touched themselves. While the player touches a W, hitting the
// SIDE of a block or ramp does not kill and the player goes through it; while touching an R,
// hitting it head first does not kill and the player rises through. Laid over visible blocks they
// make hidden passages. Spikes still kill inside a zone.
export const ZONES = ["w-block", "r-block"];
export const BLOCKS = ["block", "grid", "black", "outline", "plain-black"];
export const RAMPS = ["ramp", "ramp-grid", "ramp-black"];
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
  "gravity-up",
  "gravity-down",
  ...Object.keys(SPEEDS),
];
// Modes that ride surfaces instead of dying on them: floor, ceiling and block faces are safe,
// walls still kill.
export const SOFT = ["plane", "pogo", "angle"];
export const TYPES = [...BLOCKS, ...ZONES, ...SPIKES, ...PORTALS, ...RAMPS, "ring"];
// Ids that were renamed after they had been stored. validateLevel accepts the old id and returns
// the new one, so an old save, share code or link still loads; nothing writes the old id again.
export const LEGACY_TYPES: Partial<Record<string, ObjectType>> = {
  jumper: "pogo", // 2026-09-29, the stored id followed the POGO label (#33)
};
export const SCALABLE = [...BLOCKS, ...ZONES, ...SPIKES, ...RAMPS]; // pieces that take a scale; rings and portals stay 1x
// A ring with no bounce field is the original: JUMP, a 2.25 block peak. A set bounce is the peak
// height in blocks, so the launch speed is the one that reaches it under level gravity.
export const RING_BOUNCE = 2.25;
export const ringSpeed = (o: Piece) =>
  o.bounce === undefined ? JUMP : Math.sqrt(2 * GRAVITY * o.bounce);
export const levelHeight = (level: Level) => level.height ?? 7;
export function object(type: ObjectType, x: number, y = 0): Piece {
  return { type, x, y, rotation: 0, flipX: false, flipY: false };
}
export function polygon(o: Piece): Point[] {
  const portal = PORTALS.includes(o.type),
    scale = o.type === "small" ? 2 / 3 : o.type === "quarter" ? 0.25 : 1;
  const h = portal ? 2.5 : o.type === "half" ? 0.5 : scale,
    w = portal ? 0.6 : scale;
  const points = RAMPS.includes(o.type)
    ? [
        [0, 0],
        [1, 0],
        [1, 1],
      ]
    : o.type === "ring"
      ? Array.from({ length: 16 }, (_, i) => [
          0.5 + 0.45 * Math.cos((i * Math.PI) / 8),
          0.5 + 0.45 * Math.sin((i * Math.PI) / 8),
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
export function createState(level: Level): GameState {
  return {
    x: 1,
    y: 0,
    vy: 0,
    mode: "square",
    gravity: -1,
    speed: 1,
    wall: null,
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
  return !s.usedRings.includes(index) && dx * dx + dy * dy <= 0.6 * 0.6;
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
  const ring = tapped
    ? s.level.objects.findIndex(
        (o, i) => o.type === "ring" && ringReady(s, o, i),
      )
    : -1;
  if (ring >= 0) {
    s.usedRings.push(ring);
    s.vy = -s.gravity * ringSpeed(s.level.objects[ring]);
    s.grounded = false;
  }
  if (ring < 0 && s.mode === "wheel" && s.grounded && tapped) {
    s.gravity *= -1;
    s.vy = 0;
    s.grounded = false;
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
  const acceleration =
    s.mode === "plane"
      ? -s.gravity * (held ? 14 : -12)
      : s.mode === "angle"
        ? 0
        : s.gravity * GRAVITY;
  s.x += forward * dt;
  s.time += dt;
  s.y += s.vy * dt + (acceleration * dt * dt) / 2;
  s.vy += acceleration * dt;
  if (s.mode === "plane") s.vy = Math.max(-4, Math.min(4, s.vy));
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
    if (o.layer === "background") continue;
    if (o.type === "ring" || ZONES.includes(o.type)) continue;
    const reach = 2 * (o.scale ?? 1); // a scaled piece is wider than its anchor cell
    if (o.x > s.x + reach || o.x < s.x - reach) continue;
    if (PORTALS.includes(o.type)) {
      const player = playerPolygon(s);
      if (intersects(player, polygon(o))) {
        touching.push(i);
        if (!s.touchingPortals.includes(i)) {
          if (o.type in SPEEDS) s.speed = SPEEDS[o.type];
          else if (o.type.startsWith("gravity-")) {
            s.gravity = o.type === "gravity-up" ? 1 : -1;
            s.vy = 0;
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
      ramp = RAMPS.includes(o.type) || (BLOCKS.includes(o.type) && o.rotation % 90 !== 0),
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
        if (following || crossing) {
          s.y = surface - (upper ? 0 : SIZE);
          s.vy = 0;
          s.grounded = upper ? s.gravity < 0 : s.gravity > 0;
        }
      }
    }
    // Modes that ride surfaces slide along a block's head face, and anyone touching an R bumps
    // it: the rise stops at the face and gravity takes over, nobody dies.
    const headSlide = safeSolid || (inR && BLOCKS.includes(o.type));
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
    const player = playerPolygon(s, DEATH_INSET);
    if (intersects(player, p)) {
      // The trail only moves forward, so a hazard box that was clear of the piece's left edge
      // came in from the side: a wall. Touching a W, a wall stops the run instead of crashing it.
      // The hazard box is held against the wall's face, the run waits there, and a jump that
      // clears the wall carries on. Spikes still kill.
      const fromSide = oldX + SIZE - DEATH_INSET <= b.left + 0.001;
      // Vertical support is resolved above. Wall impacts kill in every mode.
      if (inW && fromSide && !SPIKES.includes(o.type)) {
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
      (SCALABLE.includes(o.type)
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
      (o.type !== "ring" ||
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
    if (o.layer !== undefined && o.layer !== "background")
      throw Error("Invalid layer");
    if (o.layer === "background" && !BLOCKS.includes(o.type) && !ZONES.includes(o.type))
      throw Error("Only blocks go in the background");
    if (raw.height !== undefined && bounds(o).top > height + 0.00001)
      throw Error("Object above ceiling");
  }
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
