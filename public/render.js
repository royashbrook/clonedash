import { polygon, bounds, PORTALS, SIZE } from './engine.js';
const portalLook = { plane: ['#ffd166', 'FLY', '▷'], square: ['#72f7dc', 'JUMP', '□'], wheel: ['#ff8ac4', 'WHEEL', '⊙'], jumper: ['#53e3ff', 'JUMPER', '⇈'], 'gravity-up': ['#53e3ff', 'UP', '↑'], 'gravity-down': ['#ffb477', 'DOWN', '↓'] };
export function render(canvas, { state, level, camera = 0, editing = false, selected = -1, time = 0, reduced = false, areaBottom, areaTop = 0 }) {
  const w = innerWidth, h = innerHeight, dpr = Math.min(devicePixelRatio || 1, 2);
  if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) { canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr); }
  const ctx = canvas.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const floor = editing ? (areaBottom ?? h - 180) - 18 : h - Math.max(42, h * .16);
  const hasGravity = level.objects.some(o => ['wheel', 'gravity-up', 'gravity-down'].includes(o.type));
  const top = !editing && hasGravity ? Math.max(84, areaTop) : areaTop;
  const unit = Math.max(12, Math.min((floor - top - 14) / 7, w / 13.5, 82));
  const X = x => (x - camera) * unit, Y = y => floor - y * unit;
  const color = level.color || '#9aff6b';
  const bg = ctx.createLinearGradient(0, 0, w, h); bg.addColorStop(0, '#101825'); bg.addColorStop(1, '#172c3d');
  ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h);
  ctx.lineWidth = 1;
  // Geometric parallax is deliberately subtle: the next obstacle stays the focal point.
  ctx.strokeStyle = '#ffffff09';
  for (let x = -((camera * unit * .25) % (unit * 2)); x < w; x += unit * 2) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke(); }
  for (let y = floor % (unit * 2); y < h; y += unit * 2) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }
  if (!editing) {
    ctx.strokeStyle = `${color}12`; ctx.lineWidth = 2;
    for (let i = 0; i < 8; i++) {
      const x = ((i * 247 - camera * unit * .13) % (w + 300) + w + 300) % (w + 300) - 150;
      const y = h * .27 + Math.sin(i * 4) * h * .12;
      ctx.save(); ctx.translate(x, y); ctx.rotate(.3 + i); ctx.strokeRect(-40, -40, 80, 80); ctx.restore();
    }
  } else {
    ctx.strokeStyle = '#ffffff25'; ctx.lineWidth = 1;
    for (let x = Math.floor(camera); X(x) < w; x++) {
      ctx.beginPath(); ctx.moveTo(X(x), areaTop); ctx.lineTo(X(x), floor); ctx.stroke();
      if (x % 5 === 0) { ctx.fillStyle = '#b6c5d8'; ctx.font = '12px monospace'; ctx.fillText(String(x), X(x) + 3, floor + 14); }
    }
    for (let y = 0; y <= 7; y++) { ctx.beginPath(); ctx.moveTo(0, Y(y)); ctx.lineTo(w, Y(y)); ctx.stroke(); }
    ctx.fillStyle = '#9aff6b12'; ctx.fillRect(X(0), Y(7), 3 * unit, 7 * unit);
  }
  ctx.fillStyle = '#0a111c'; ctx.fillRect(0, floor, w, h - floor);
  ctx.strokeStyle = `${color}30`; ctx.lineWidth = 1;
  for (let x = -(camera * unit % (unit / 2)); x < w; x += unit / 2) { ctx.beginPath(); ctx.moveTo(x, floor); ctx.lineTo(x - h * .2, h); ctx.stroke(); }
  for (let y = floor + 14; y < h; y += 18) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }
  ctx.fillStyle = color; ctx.fillRect(0, floor, w, 2);
  if (hasGravity) { ctx.fillStyle = '#0a111c'; ctx.fillRect(0, Y(7) - 12, w, 12); ctx.fillStyle = color; ctx.fillRect(0, Y(7) - 2, w, 2); }
  level.objects.forEach((o, index) => {
    if (X(o.x) < -unit * 2 || X(o.x) > w + unit) return;
    if (PORTALS.includes(o.type)) {
      const x = X(o.x + .3), y = Y(o.y + 1.25), [c, label, icon] = portalLook[o.type];
      ctx.save(); ctx.strokeStyle = c; ctx.lineWidth = 3; ctx.fillStyle = `${c}18`;
      ctx.beginPath(); ctx.ellipse(x, y, unit * .3, unit * 1.25, -o.rotation * Math.PI / 180, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.fillStyle = c; ctx.font = `bold ${Math.max(12, unit * .28)}px system-ui`; ctx.textAlign = 'center'; ctx.fillText(label, x, y - unit * 1.4);
      ctx.translate(x, y); ctx.rotate(-o.rotation * Math.PI / 180); ctx.scale(o.flipX ? -1 : 1, o.flipY ? -1 : 1); ctx.strokeStyle = '#fff'; ctx.lineWidth = 2;
      ctx.fillStyle = '#fff'; ctx.font = `bold ${unit * .55}px system-ui`; ctx.textBaseline = 'middle'; ctx.fillText(icon, 0, 0);
      ctx.restore();
    } else {
      const p = polygon(o); ctx.beginPath(); p.forEach(([x, y], i) => i ? ctx.lineTo(X(x), Y(y)) : ctx.moveTo(X(x), Y(y))); ctx.closePath();
      const grad = ctx.createLinearGradient(0, Y(o.y + 1), 0, Y(o.y)); grad.addColorStop(0, '#35465d'); grad.addColorStop(1, '#03070c');
      ctx.fillStyle = o.type === 'black' ? '#000000' : grad;
      if (o.type !== 'outline') ctx.fill();
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2; ctx.stroke();
      if (o.type === 'grid') {
        ctx.save(); ctx.clip(); ctx.strokeStyle = '#ffffff35'; ctx.lineWidth = 1;
        for (let q = 1; q <= 3; q++) { ctx.beginPath(); ctx.moveTo(X(o.x + q / 4), Y(o.y)); ctx.lineTo(X(o.x + q / 4), Y(o.y + 1)); ctx.moveTo(X(o.x), Y(o.y + q / 4)); ctx.lineTo(X(o.x + 1), Y(o.y + q / 4)); ctx.stroke(); } ctx.restore();
      }
    }
    if (editing && index === selected) {
      const b = bounds(o);
      ctx.strokeStyle = '#9aff6b'; ctx.lineWidth = 3; ctx.setLineDash([5, 3]); ctx.strokeRect(X(b.left) - 5, Y(b.top) - 5, (b.right - b.left) * unit + 10, (b.top - b.bottom) * unit + 10); ctx.setLineDash([]);
    }
  });
  if (X(level.length) < w + 100) {
    ctx.fillStyle = `${color}12`; ctx.fillRect(X(level.length), Y(7), unit * 2, unit * 7);
    ctx.fillStyle = color; ctx.font = 'bold 14px system-ui'; ctx.fillText('FINISH', X(level.length) - 12, Y(3));
    for (let y = 0; y < 6; y++) for (let x = 0; x < 2; x++) if ((x + y) % 2 === 0) ctx.fillRect(X(level.length + x * .18), Y(y * .25 + .25), unit * .18, unit * .25);
  }
  if (state) {
    const x = X(state.x + SIZE / 2), y = Y(state.y + SIZE / 2);
    ctx.save(); ctx.translate(x, y);
    if (state.status === 'dead') {
      const t = Math.min(time, .6);
      if (!reduced) for (let i = 0; i < 12; i++) { const a = i * 2.4; ctx.globalAlpha = 1 - t / .65; ctx.fillStyle = color; ctx.fillRect(Math.cos(a) * t * unit * 3, Math.sin(a) * t * unit * 3 + t * t * unit, unit * .12, unit * .12); }
    } else {
      if (!reduced) { ctx.fillStyle = `${color}35`; for (let i = 3; i >= 1; i--) ctx.fillRect(-unit * (.3 + i * .18), -unit * .15, unit * .2, unit * .3); }
      if (state.mode === 'square' || state.mode === 'jumper') {
        if (state.gravity > 0) ctx.scale(1, -1);
        if (!state.grounded && !reduced) ctx.rotate(-state.time * Math.PI * 2);
        const a = SIZE * unit;
        ctx.fillStyle = color; ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.fillRect(-a / 2, -a / 2, a, a); ctx.strokeRect(-a / 2, -a / 2, a, a);
        ctx.fillStyle = '#101825';
        if (state.mode === 'jumper') {
          ctx.strokeStyle = '#101825'; ctx.lineWidth = Math.max(2, a * .08);
          for (const offset of [-.12, .15]) { ctx.beginPath(); ctx.moveTo(-a * .23, a * (offset + .1)); ctx.lineTo(0, a * (offset - .12)); ctx.lineTo(a * .23, a * (offset + .1)); ctx.stroke(); }
        } else { ctx.fillRect(-a * .27, -a * .18, a * .15, a * .17); ctx.fillRect(a * .12, -a * .18, a * .15, a * .17); ctx.fillRect(-a * .22, a * .18, a * .44, a * .06); }
      } else if (state.mode === 'wheel') {
        const r = SIZE * unit / 2;
        ctx.save(); if (!reduced) ctx.rotate(state.x * 3 * -state.gravity);
        ctx.fillStyle = color; ctx.strokeStyle = '#fff'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        ctx.strokeStyle = '#101825';
        for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4; ctx.beginPath(); ctx.moveTo(Math.cos(a) * r * .7, Math.sin(a) * r * .7); ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r); ctx.stroke(); }
        ctx.restore(); ctx.fillStyle = '#101825'; ctx.font = `bold ${r * 1.6}px system-ui`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(state.gravity > 0 ? '↑' : '↓', 0, 0);
      } else {
        if (state.gravity > 0) ctx.scale(1, -1);
        ctx.rotate(-state.vy * .06); ctx.fillStyle = color; ctx.strokeStyle = '#fff'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(unit * .42, 0); ctx.lineTo(-unit * .34, -unit * .29); ctx.lineTo(-unit * .17, 0); ctx.lineTo(-unit * .34, unit * .29); ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#101825'; ctx.fillRect(-unit * .05, -unit * .07, unit * .12, unit * .14);
      }
    }
    ctx.restore();
  }
  return { unit, floor, camera, x: x => x / unit + camera, y: y => (floor - y) / unit };
}
