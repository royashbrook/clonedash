export const SPEED = 2.5, GRAVITY = 16, JUMP = 8, SIZE = .64, STEP = 1 / 120;
export const TYPES = ['block', 'grid', 'spike', 'half', 'plane', 'square'];
export function object(type, x, y = 0) { return { type, x, y, rotation: 0, flipX: false, flipY: false }; }
export function polygon(o) {
  const portal = ['plane', 'square'].includes(o.type), h = portal ? 2.5 : o.type === 'half' ? .5 : 1, w = portal ? .6 : 1;
  const points = ['spike', 'half'].includes(o.type) ? [[0, 0], [1, 0], [.5, h]] : [[0, 0], [w, 0], [w, h], [0, h]];
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
  return { x: 1, y: 0, vy: 0, mode: 'square', grounded: true, status: 'playing', time: 0, portal: -1, level };
}
export function step(s, held, dt = STEP) {
  if (s.status !== 'playing') return s;
  const oldY = s.y;
  if (s.mode === 'square' && s.grounded && held) { s.vy = JUMP; s.grounded = false; }
  const acceleration = s.mode === 'plane' ? (held ? 14 : -12) : -GRAVITY;
  s.x += SPEED * dt; s.time += dt;
  s.y += s.vy * dt + acceleration * dt * dt / 2;
  s.vy += acceleration * dt;
  if (s.mode === 'plane') s.vy = Math.max(-4, Math.min(4, s.vy));
  s.grounded = false;
  if (s.y <= 0) {
    s.y = 0; s.vy = 0; s.grounded = true;
    if (s.mode === 'plane') s.status = 'dead';
  }
  if (s.y + SIZE > 7) s.status = 'dead';
  for (let i = 0; i < s.level.objects.length; i++) {
    const o = s.level.objects[i];
    if (o.x > s.x + 2 || o.x < s.x - 2) continue;
    if (o.type === 'plane' || o.type === 'square') {
      const player = [[s.x, s.y], [s.x + SIZE, s.y], [s.x + SIZE, s.y + SIZE], [s.x, s.y + SIZE]];
      if (s.portal !== i && intersects(player, polygon(o))) {
        s.mode = o.type; s.portal = i;
        if (o.type === 'plane') { s.y = Math.max(.5, s.y); s.vy = 3; s.grounded = false; }
      }
      continue;
    }
    const p = polygon(o), b = bounds(o);
    if (o.type === 'block' || o.type === 'grid') {
      if (s.mode === 'square' && s.vy <= 0 && oldY >= b.top - .015 && s.y <= b.top && s.x + SIZE > b.left + .001 && s.x < b.right - .001) {
        s.y = b.top; s.vy = 0; s.grounded = true;
      }
    }
    const player = [[s.x, s.y], [s.x + SIZE, s.y], [s.x + SIZE, s.y + SIZE], [s.x, s.y + SIZE]];
    if (intersects(player, p)) s.status = 'dead';
  }
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
