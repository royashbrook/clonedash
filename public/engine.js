// Quarter-block clearance makes a two-block ledge landable, not just reachable at one instant.
export const SPEED = 5, GRAVITY = 16, JUMP = Math.sqrt(2 * GRAVITY * 2.25), SIZE = .64, STEP = 1 / 120;
export const BLOCKS = ['block', 'grid', 'black'];
export const SPIKES = ['spike', 'half', 'small'];
export const PORTALS = ['plane', 'square', 'wheel', 'gravity-up', 'gravity-down'];
export const TYPES = [...BLOCKS, ...SPIKES, ...PORTALS];
export function object(type, x, y = 0) { return { type, x, y, rotation: 0, flipX: false, flipY: false }; }
export function polygon(o) {
  const portal = PORTALS.includes(o.type), h = portal ? 2.5 : o.type === 'half' ? .5 : o.type === 'small' ? 2 / 3 : 1, w = portal ? .6 : o.type === 'small' ? 2 / 3 : 1;
  const points = SPIKES.includes(o.type) ? [[0, 0], [w, 0], [w / 2, h]] : [[0, 0], [w, 0], [w, h], [0, h]];
  const a = o.rotation * Math.PI / 180, c = Math.round(Math.cos(a)), s = Math.round(Math.sin(a));
  return points.map(([x, y]) => {
    x = (x - w / 2) * (o.flipX ? -1 : 1); y = (y - h / 2) * (o.flipY ? -1 : 1);
    return [o.x + w / 2 + x * c - y * s, o.y + h / 2 + x * s + y * c];
  });
}
export function bounds(o) {
  const p = polygon(o), xs = p.map(p => p[0]), ys = p.map(p => p[1]);
  return { left: Math.min(...xs), right: Math.max(...xs), bottom: Math.min(...ys), top: Math.max(...ys) };
}
// Both renderer and collision use the transformed polygon, including half spikes.
export function intersects(a, b) {
  for (const p of [a, b]) for (let i = 0; i < p.length; i++) {
    const next = p[(i + 1) % p.length], axis = [p[i][1] - next[1], next[0] - p[i][0]];
    const aa = a.map(v => v[0] * axis[0] + v[1] * axis[1]), bb = b.map(v => v[0] * axis[0] + v[1] * axis[1]);
    if (Math.max(...aa) <= Math.min(...bb) + .00001 || Math.max(...bb) <= Math.min(...aa) + .00001) return false;
  }
  return true;
}
export function createState(level) {
  return { x: 1, y: 0, vy: 0, mode: 'square', gravity: -1, inputHeld: false, grounded: true, status: 'playing', time: 0, touchingPortals: [], level };
}
export function step(s, held, dt = STEP, tapped = held && !s.inputHeld) {
  if (s.status !== 'playing') return s;
  s.inputHeld = held;
  const oldY = s.y;
  if (s.mode === 'wheel' && tapped) { s.gravity *= -1; s.vy = 0; s.grounded = false; }
  if (s.mode === 'square' && s.grounded && held) { s.vy = -s.gravity * JUMP; s.grounded = false; }
  const acceleration = s.mode === 'plane' ? -s.gravity * (held ? 14 : -12) : s.gravity * GRAVITY;
  s.x += SPEED * dt; s.time += dt;
  s.y += s.vy * dt + acceleration * dt * dt / 2;
  s.vy += acceleration * dt;
  if (s.mode === 'plane') s.vy = Math.max(-4, Math.min(4, s.vy));
  s.grounded = false;
  if (s.y <= 0) {
    s.y = 0; s.vy = 0; s.grounded = s.gravity < 0;
    if (s.gravity > 0 && s.mode !== 'plane') s.status = 'dead';
  }
  if (s.y + SIZE > 7) {
    if (s.gravity > 0 || s.mode === 'plane') { s.y = 7 - SIZE; s.vy = 0; s.grounded = s.gravity > 0; }
    else s.status = 'dead';
  }
  const touching = [];
  for (let i = 0; i < s.level.objects.length; i++) {
    const o = s.level.objects[i];
    if (o.x > s.x + 2 || o.x < s.x - 2) continue;
    if (PORTALS.includes(o.type)) {
      const player = [[s.x, s.y], [s.x + SIZE, s.y], [s.x + SIZE, s.y + SIZE], [s.x, s.y + SIZE]];
      if (intersects(player, polygon(o))) {
        touching.push(i);
        if (!s.touchingPortals.includes(i)) {
          if (o.type.startsWith('gravity-')) { s.gravity = o.type === 'gravity-up' ? 1 : -1; s.vy = 0; s.grounded = false; }
          else {
            s.mode = o.type;
            if (o.type === 'plane') { s.y = Math.max(.5, Math.min(7 - SIZE - .5, s.y)); s.vy = -s.gravity * 3; s.grounded = false; }
          }
        }
      }
      continue;
    }
    const p = polygon(o), b = bounds(o);
    if (BLOCKS.includes(o.type) && s.x + SIZE > b.left + .001 && s.x < b.right - .001) {
      if ((s.gravity < 0 || s.mode === 'plane') && s.vy <= 0 && oldY >= b.top - .015 && s.y <= b.top) {
        s.y = b.top; s.vy = 0; s.grounded = s.gravity < 0;
      } else if ((s.gravity > 0 || s.mode === 'plane') && s.vy >= 0 && oldY + SIZE <= b.bottom + .015 && s.y + SIZE >= b.bottom) {
        s.y = b.bottom - SIZE; s.vy = 0; s.grounded = s.gravity > 0;
      }
    }
    const player = [[s.x, s.y], [s.x + SIZE, s.y], [s.x + SIZE, s.y + SIZE], [s.x, s.y + SIZE]];
    if (intersects(player, p)) {
      if (s.mode === 'plane' && BLOCKS.includes(o.type)) {
        // Solid contact is safe: slide underneath or stop at a wall until the pilot climbs.
        if (oldY + SIZE <= b.bottom + .015 && s.vy > 0) { s.y = b.bottom - SIZE; s.vy = 0; }
        else s.x = b.left - SIZE;
      } else s.status = 'dead';
    }
  }
  s.touchingPortals = touching;
  if (s.status === 'playing' && s.x >= s.level.length) s.status = 'complete';
  return s;
}
export function validateLevel(raw) {
  if (!raw || typeof raw.name !== 'string' || raw.name.length > 40 || !Number.isFinite(raw.length) || raw.length < 20 || raw.length > 200 || !Array.isArray(raw.objects) || raw.objects.length > 600) throw Error('Invalid level');
  for (const o of raw.objects) {
    if (!o || !TYPES.includes(o.type) || !Number.isFinite(o.x) || !Number.isFinite(o.y) || o.x < 3 || o.x > raw.length - 2 || o.y < -.5 || o.y > 6 || ![0, 90, 180, 270].includes(o.rotation) || typeof o.flipX !== 'boolean' || typeof o.flipY !== 'boolean') throw Error('Invalid object');
  }
  return structuredClone(raw);
}
export function transform(o, action, amount = 1) {
  if (action === 'left') o.x -= amount;
  if (action === 'right') o.x += amount;
  if (action === 'up') o.y += amount;
  if (action === 'down') o.y -= amount;
  if (action === 'cw') o.rotation = (o.rotation + 270) % 360;
  if (action === 'ccw') o.rotation = (o.rotation + 90) % 360;
  if (action === 'flipX') o.flipX = !o.flipX;
  if (action === 'flipY') o.flipY = !o.flipY;
  o.x = Math.round(o.x * 20) / 20; o.y = Math.round(o.y * 20) / 20;
  return o;
}
