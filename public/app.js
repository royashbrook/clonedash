import { createState, step, STEP, object, transform, validateLevel, bounds, duplicateObject } from './engine.js';
import { LEVELS } from './levels.js';
import { render } from './render.js';
import { wireInstall } from './install.js';
import { Soundtrack } from './music.js';

const $ = id => document.getElementById(id), canvas = $('world');
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
const SAVE = 'clonedash.v1';
let save = { version: 1, best: {}, draft: { name: 'My trail', length: 40, objects: [] }, sound: false }, storageOK = true;
try {
  const raw = localStorage.getItem(SAVE);
  if (raw) {
    const p = JSON.parse(raw);
    if (p.version !== 1 || !p.best || typeof p.best !== 'object' || Array.isArray(p.best)) throw Error();
    validateLevel(p.draft);
    if (Object.entries(p.best).some(([k, v]) => !/^\d+$/.test(k) || +k >= LEVELS.length || !Number.isFinite(v) || v < 0 || v > 100)) throw Error();
    save = p;
  }
} catch { storageOK = false; }
function persist() {
  if (storageOK) try { localStorage.setItem(SAVE, JSON.stringify(save)); } catch { storageOK = false; }
  $('draft-status').textContent = storageOK ? 'Saved on this device' : 'NOT SAVED · storage unavailable';
  if (!storageOK) toast('Storage unavailable. You can still play; progress is not saved.');
}
let toastTimer;
function toast(message) { $('notice').textContent = message; $('notice').hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => $('notice').hidden = true, 4200); }
let mode = 'home', state, current = 0, custom = false, paused = false, held = false, jumpBuffer = 0, attempt = 1, deathTime = 0, readyTime = 0, acc = 0, last = 0, camera = 0, learned = false, cueUntil = 5;
let draft = structuredClone(save.draft), selected = -1, tool = 'block', tab = 'blocks';
let audio;
const music = new Soundtrack();
function tone(freq, duration = .08, volume = .03) {
  if (!save.sound || document.hidden) return;
  try { audio ??= new AudioContext(); void audio.resume(); const osc = audio.createOscillator(), gain = audio.createGain(); osc.type = 'triangle'; osc.frequency.value = freq; gain.gain.setValueAtTime(volume, audio.currentTime); gain.gain.exponentialRampToValueAtTime(.001, audio.currentTime + duration); osc.connect(gain).connect(audio.destination); osc.start(); osc.stop(audio.currentTime + duration); } catch { /* Audio is optional. */ }
}
function soundLabel() { $('sound').textContent = save.sound ? 'SOUND ON' : 'SOUND OFF'; $('sound').setAttribute('aria-label', save.sound ? 'Turn sound off' : 'Turn sound on'); }
$('sound').onclick = () => { save.sound = !save.sound; soundLabel(); persist(); music.unlock(save.sound); };
soundLabel();
function updateHome() {
  const completed = LEVELS.filter((_, i) => save.best[i] === 100).length;
  const next = LEVELS.findIndex((_, i) => save.best[i] !== 100); current = next < 0 ? 0 : next;
  $('stars').textContent = `${completed} / ${LEVELS.length}`;
  $('play').firstChild.textContent = `PLAY ${LEVELS[current].name.toUpperCase()} `;
  $('progress-copy').textContent = completed ? `${completed} trails complete. Every trail is always open.` : 'Your first jump starts here.';
  $('levels').replaceChildren(...LEVELS.map((l, i) => {
    const b = document.createElement('button'); b.className = 'level-card'; b.setAttribute('aria-label', `Play ${l.name}`);
    const n = document.createElement('span'); n.className = 'number'; n.textContent = String(i + 1).padStart(2, '0');
    const title = document.createElement('span'); title.className = 'title'; title.textContent = l.name;
    const sub = document.createElement('small'); sub.textContent = l.note; title.append(sub);
    const score = document.createElement('span'); score.className = 'score'; score.textContent = save.best[i] === 100 ? '✓' : `${save.best[i] || 0}%`;
    b.append(n, title, score); b.onclick = () => start(i); return b;
  }));
}
function setMode(m) {
  mode = m; document.body.dataset.mode = m;
  $('home').hidden = m !== 'home'; $('editor').hidden = m !== 'editor'; $('hud').hidden = m !== 'play';
  $('cue').hidden = true; held = false; acc = 0; orientation();
}
function start(index, isCustom = false) {
  music.unlock(save.sound);
  current = index; custom = isCustom; attempt = 1; learned = false; camera = 0;
  closeSheet(); setMode('play'); resetRun(); paused = false; orientation(); tone(523, .1);
}
function resetRun() {
  music.stop();
  state = createState(custom ? structuredClone(draft) : LEVELS[current]); deathTime = 0; readyTime = .4; held = false; jumpBuffer = 0; acc = 0; cueUntil = 5;
  $('level-name').textContent = state.level.name; $('attempt').textContent = `TRY ${attempt}`;
}
function record() {
  if (custom) return;
  const percent = state.status === 'complete' ? 100 : Math.min(99, Math.floor((state.x - 1) / (state.level.length - 1) * 100));
  if (percent > (save.best[current] || 0)) { save.best[current] = percent; persist(); }
}
function home() { closeSheet(); if (state && mode === 'play') record(); paused = false; setMode('home'); updateHome(); }
$('play').onclick = () => start(current);
function closeSheet() { $('sheet').close(); }
function sheet(title, text, actions = [], closable = true) {
  const content = $('sheet-content'); content.replaceChildren();
  const h = document.createElement('h2'); h.textContent = title; content.append(h);
  if (text) { const p = document.createElement('p'); p.textContent = text; content.append(p); }
  const buttons = document.createElement('div'); buttons.className = 'buttons';
  actions.forEach(([label, handler, primary]) => { const b = document.createElement('button'); b.textContent = label; if (primary) b.className = 'primary'; b.onclick = handler; buttons.append(b); });
  content.append(buttons); $('sheet-close').hidden = !closable;
  if (!$('sheet').open) $('sheet').showModal();
}
$('sheet-close').onclick = closeSheet;
$('sheet').addEventListener('cancel', event => { if (mode === 'play') { event.preventDefault(); if (state.status === 'playing') resume(); } });
function pause() {
  if (mode !== 'play' || state.status === 'complete') return;
  held = false; jumpBuffer = 0; paused = true; acc = 0; music.stop();
  sheet('Paused', 'Your run is right where you left it.', [['RESUME', resume, true], ['RESTART LEVEL', () => { closeSheet(); attempt++; resetRun(); paused = false; orientation(); }], [custom ? 'BACK TO EDITOR' : 'MAIN MENU', custom ? openEditor : home]], false);
}
function resume() { closeSheet(); paused = false; held = false; acc = 0; last = performance.now(); orientation(); }
$('pause').onclick = pause; $('menu').onclick = pause; $('rotate-menu').onclick = home;
function orientation() {
  const narrow = innerHeight > innerWidth && mode !== 'home';
  $('rotate').hidden = !narrow;
  if (narrow && mode === 'play') { held = false; paused = true; acc = 0; music.stop(); closeSheet(); }
  else if (mode === 'play' && paused && !$('sheet').open && state?.status === 'playing') pause();
}
addEventListener('resize', orientation);
document.addEventListener('visibilitychange', () => { if (document.hidden) { pause(); held = false; music.stop(); audio?.suspend(); } });
addEventListener('pagehide', () => { pause(); held = false; music.stop(); });
addEventListener('blur', () => { held = false; if (mode === 'play') pause(); });
function complete() {
  record(); held = false; tone(784, .2); setTimeout(() => tone(1047, .3), 130);
  const actions = custom ? [['BACK TO EDITOR', openEditor, true], ['Restart Level', () => start(current, true)], ['Main Menu', home]] : [['Main Menu', home, true], ['Restart Level', () => start(current)], ...(current < LEVELS.length - 1 ? [['NEXT TRAIL', () => start(current + 1)]] : [])];
  sheet('Level Complete!', custom ? 'Your trail works. Keep building!' : `${state.level.name} cleared. Nice flow.`, actions, false);
}
function press() {
  if (mode !== 'play' || paused || !$('rotate').hidden || $('sheet').open) return;
  held = true; jumpBuffer = .12; learned = true; tone(440, .045, .018);
}
canvas.addEventListener('pointerdown', e => { if (mode === 'editor') { editAt(e); return; } e.preventDefault(); canvas.setPointerCapture(e.pointerId); press(); });
for (const event of ['pointerup', 'pointercancel', 'lostpointercapture']) canvas.addEventListener(event, () => held = false);
addEventListener('keydown', e => {
  if (['INPUT', 'SELECT', 'TEXTAREA'].includes(e.target.tagName)) return;
  if (e.code === 'Space' || e.code === 'ArrowUp') { if (mode === 'play') { e.preventDefault(); if (!e.repeat) press(); } }
  if (e.code === 'Escape' && mode === 'play' && !$('sheet').open) pause();
  if (mode === 'editor' && selected >= 0) {
    const key = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down' }[e.code];
    if (key) { e.preventDefault(); adjust(key); }
    if (e.code === 'Delete' || e.code === 'Backspace') { e.preventDefault(); deleteSelected(); }
  }
});
addEventListener('keyup', e => { if (e.code === 'Space' || e.code === 'ArrowUp') held = false; });
function frame(now) {
  const dt = Math.min(.05, (now - (last || now)) / 1000); last = now;
  if (mode === 'play' && !paused && $('rotate').hidden && !document.hidden && state.status !== 'complete') {
    if (state.status === 'dead') { deathTime += dt; if (deathTime >= .65) { attempt++; resetRun(); } }
    else if (readyTime > 0) readyTime -= dt;
    else {
      acc += dt;
      while (acc >= STEP && state.status === 'playing') {
        const grounded = state.grounded, previousMode = state.mode, ringsUsed = state.usedRings.length, freshTap = jumpBuffer > 0;
        step(state, held || (state.mode === 'square' && jumpBuffer > 0), STEP, freshTap);
        jumpBuffer = (freshTap && (previousMode === 'wheel' || previousMode === 'jumper')) || ringsUsed !== state.usedRings.length || previousMode !== state.mode || (grounded && !state.grounded) ? 0 : Math.max(0, jumpBuffer - STEP);
        if (previousMode !== state.mode) { learned = false; cueUntil = state.time + 4; }
        acc -= STEP;
      }
      if (state.status === 'dead') { deathTime = 0; held = false; record(); tone(90, .16); }
      if (state.status === 'complete') complete();
    }
    camera = Math.max(0, state.x - 3);
  }
  music.sync(mode === 'play' && !custom ? current : 0, !document.hidden && (mode === 'home' || mode === 'editor' || (mode === 'play' && !paused && $('rotate').hidden && state.status === 'playing' && readyTime <= 0)), mode === 'play' ? state.time : now / 1000);
  draw();
  if (mode === 'play') {
    $('run-progress').value = Math.min(100, (state.x - 1) / (state.level.length - 1) * 100);
    $('cue').hidden = paused || !$('rotate').hidden || learned || state.time > cueUntil || state.status !== 'playing';
    if (!$('cue').hidden) {
      $('cue').firstChild.textContent = state.mode === 'plane' ? 'HOLD TO FLY ' : state.mode === 'wheel' ? 'TAP TO FLIP GRAVITY ' : 'TAP TO JUMP ';
      $('cue').querySelector('span').textContent = state.mode === 'plane' ? 'RELEASE TO FALL' : state.mode === 'wheel' ? 'LAND FIRST · THEN TAP' : state.mode === 'jumper' ? 'TAP AGAIN IN MIDAIR' : 'HOLD TO KEEP JUMPING';
    }
    $('level-name').textContent = `${state.level.name} · ${state.mode.toUpperCase()} ${state.gravity > 0 ? '↑' : '↓'}`;
  }
  requestAnimationFrame(frame);
}
function draw() {
  const level = mode === 'editor' ? draft : mode === 'play' ? state.level : LEVELS[0];
  return render(canvas, { level, state: mode === 'play' ? state : mode === 'home' ? { ...createState(level), x: 9, y: 1.3, grounded: false, time: 0 } : null, camera: mode === 'editor' ? +$('pan').value : mode === 'play' ? camera : 0, editing: mode === 'editor', selected, time: deathTime, reduced: reduced.matches, areaTop: $('editor').hidden ? 0 : $('editor').querySelector('header').getBoundingClientRect().bottom, areaBottom: $('editor').hidden ? undefined : $('editor').querySelector('.editor-controls').getBoundingClientRect().top });
}
function saveDraft() {
  try { validateLevel(draft); save.draft = structuredClone(draft); persist(); } catch { toast('Keep objects inside the trail, after the start and before the finish.'); }
  updateSelection();
}
function openEditor() { closeSheet(); paused = false; setMode('editor'); $('level-title').value = draft.name; $('level-length').value = draft.length; $('pan').max = draft.length - 8; palette(); updateSelection(); }
$('editor-open').onclick = openEditor; $('editor-back').onclick = home;
$('level-title').onchange = () => { draft.name = $('level-title').value.trim() || 'My trail'; $('level-title').value = draft.name; saveDraft(); };
$('level-length').onchange = () => {
  const n = Number($('level-length').value);
  if (n < 20 || n > 200 || !Number.isFinite(n) || draft.objects.some(o => o.x > n - 2)) { $('level-length').value = draft.length; toast('Length must be 20–200 and include every object.'); return; }
  draft.length = n; $('pan').max = n - 8; saveDraft();
};
$('test-level').onclick = () => { if (!draft.objects.length) toast('An empty trail is fine. Add some jumps when you come back.'); start(0, true); };
function palette() {
  const choices = { blocks: [['block', '■ SOLID'], ['grid', '▦ GRID'], ['black', '■ BLACK'], ['outline', '□ OUTLINE'], ['plain-black', '■ NO BORDER']], spikes: [['spike', '▲ FULL'], ['half', '▴ HALF'], ['small', '▴ ⅔ SIZE'], ['quarter', '▴ ¼ SIZE']], portals: [['plane', '▷ PLANE'], ['square', '□ SQUARE'], ['wheel', '⊙ WHEEL'], ['jumper', '⇈ JUMPER']], gravity: [['gravity-up', '↑ UPSIDE DOWN'], ['gravity-down', '↓ NORMAL']], rings: [['ring', '◉ JUMP RING']], ramp: [['ramp', '◩ SOLID'], ['ramp-grid', '◩ GRID'], ['ramp-black', '◩ BLACK']] }[tab];
  $('palette').replaceChildren(...choices.map(([type, name]) => { const b = document.createElement('button'); b.textContent = name; b.setAttribute('aria-pressed', String(tool === type)); b.onclick = () => { tool = type; palette(); updateSelection(); }; return b; }));
  $('select-tool').setAttribute('aria-pressed', String(tool === 'select'));
  for (const b of document.querySelectorAll('[data-tab]')) b.setAttribute('aria-selected', String(b.dataset.tab === tab));
}
for (const b of document.querySelectorAll('[data-tab]')) b.onclick = () => { tab = b.dataset.tab; tool = { blocks: 'block', spikes: 'spike', portals: 'plane', gravity: 'gravity-up', rings: 'ring', ramp: 'ramp' }[tab]; palette(); updateSelection(); };
$('select-tool').onclick = () => { tool = 'select'; palette(); updateSelection(); };
function editAt(e) {
  if (!$('rotate').hidden || $('sheet').open) return;
  // Input can arrive before the next animation frame after opening, panning or resizing.
  const view = draw();
  const x = view.x(e.clientX), y = view.y(e.clientY);
  if (y < 0 || y > 6) return;
  if (tool === 'select') {
    selected = draft.objects.findLastIndex(o => { const b = bounds(o); return x >= b.left - .2 && x <= b.right + .2 && y >= b.bottom - .2 && y <= b.top + .2; });
    updateSelection(); return;
  }
  const unit = +$('step-size').value, ox = Math.round(x / unit) * unit, oy = Math.floor(y / unit) * unit;
  if (ox < 3 || ox > draft.length - 2) { toast('Leave three blocks at the start and two at the finish.'); return; }
  if (draft.objects.length >= 600) { toast('This trail has reached 600 objects.'); return; }
  if (draft.objects.some(o => o.x === ox && o.y === oy)) { selected = draft.objects.findIndex(o => o.x === ox && o.y === oy); updateSelection(); return; }
  draft.objects.push(object(tool, Math.round(ox * 20) / 20, Math.round(oy * 20) / 20)); selected = draft.objects.length - 1; saveDraft();
}
function updateSelection() {
  const o = draft.objects[selected];
  $('selection').textContent = o ? `${o.type.toUpperCase()} · x ${o.x.toFixed(2)} / y ${o.y.toFixed(2)} · ${o.rotation}°` : tool === 'select' ? 'Tap an object to select it.' : `Tap the grid to place ${tool === 'half' ? 'a half spike' : 'a ' + tool}.`;
  for (const b of document.querySelectorAll('[data-action],#delete-object,#duplicate-object')) b.disabled = !o;
  $('delete-all').disabled = draft.objects.length === 0;
}
function adjust(action) {
  if (selected < 0) return;
  const old = structuredClone(draft.objects[selected]); transform(draft.objects[selected], action, +$('step-size').value);
  try { validateLevel(draft); } catch { draft.objects[selected] = old; toast('That would move the object outside the trail.'); return; }
  saveDraft();
}
for (const b of document.querySelectorAll('[data-action]')) b.onclick = () => adjust(b.dataset.action);
function deleteSelected() { if (selected < 0) return; draft.objects.splice(selected, 1); selected = -1; saveDraft(); }
$('delete-object').onclick = deleteSelected;
$('duplicate-object').onclick = () => {
  try { draft.objects.push(duplicateObject(draft, selected)); selected = draft.objects.length - 1; saveDraft(); }
  catch (error) { toast(error.message); }
};
$('delete-all').onclick = () => {
  if (!draft.objects.length) return;
  sheet('Delete all objects?', `Remove all ${draft.objects.length} objects from this draft? This cannot be undone. Your completed trails will stay.`, [['CANCEL', closeSheet, true], ['DELETE ALL OBJECTS', () => { draft.objects = []; selected = -1; saveDraft(); closeSheet(); }]], false);
};
$('how').onclick = () => sheet('One button. Find your flow.', 'Square: tap or press Space to jump onto two-block ledges. Hold for another jump when you land. Jumper: same as square, but every fresh tap lets you jump again in midair. Touching blocks is safe: jump up a wall or slide under a ceiling. Try Air Steps! Plane: hold to fly against gravity; release to fall. Blocks are safe while flying. Wheel: land on a block, floor or ceiling, then tap or press Space to flip gravity. Midair taps are ignored; holding does not flip again when you land. UP and DOWN portals set gravity without changing your shape. Under upside-down gravity, land and jump on ceilings. All spikes kill, including the tiny quarter-size ones. Outline blocks are transparent but solid. Block sides stop planes and jumpers but end square and wheel runs. Your smaller hazard hitbox forgives edge grazes. Rings: tap or press Space while reaching a glowing ring for a midair jump, once per ring per run. Ramps: walk up or down the white diagonal slope. Find RINGS and RAMP tabs in the editor.');
$('about').onclick = () => {
  sheet('Clone Dash', 'Nine one-button trails and a place to build your own. An original geometric platformer inspired by Geometry Dash, made from a kid’s game idea.');
  const ethos = document.createElement('p'); ethos.textContent = document.querySelector('meta[name=description]').content;
  const mark = document.createElement('div'); mark.className = 'maker'; mark.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21 3 12C-4 4 6-3 12 5 18-3 28 4 21 12Z"/></svg> made with love by <a href="https://royashbrook.com" target="_blank" rel="noopener">roy</a> + <a href="https://royashbrook.com/agents" target="_blank" rel="noopener">ai</a> · <a href="https://github.com/sponsors/royashbrook" target="_blank" rel="noopener">sponsor me</a>';
  $('sheet-content').append(ethos, mark);
};
$('share').onclick = async () => {
  const url = new URL(location.href); url.search = `level=${current + 1}`; url.hash = '';
  try { if (navigator.share) await navigator.share({ title: 'Clone Dash', text: `Try ${LEVELS[current].name}`, url: url.href }); else { await navigator.clipboard.writeText(url.href); toast('Trail link copied.'); } } catch (e) { if (e.name !== 'AbortError') sheet('Share this trail', url.href); }
};
wireInstall($('install'), { showIosHint: () => sheet('Install Clone Dash', 'In Safari, tap Share, then Add to Home Screen, then Add. Your game will open full-screen and work offline after its first load.') });

const bootBuild = document.querySelector('meta[name=build]').content;
async function checkUpdate() {
  try {
    const res = await fetch('/?update-probe', { cache: 'no-store' });
    if (!res.ok) return;
    const doc = new DOMParser().parseFromString(await res.text(), 'text/html');
    const next = doc.querySelector('meta[name=build]')?.content;
    if (next && next !== bootBuild) $('update').hidden = false;
  } catch { /* Offline is normal. */ }
}
$('update').onclick = async () => {
  if (mode === 'play') pause();
  try { const reg = await navigator.serviceWorker?.getRegistration(); await reg?.update(); } catch { /* Network-first shell also recovers on reload. */ }
  location.reload();
};
if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' }).catch(() => {});
setInterval(checkUpdate, 60000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) void checkUpdate(); });
updateHome(); if (!storageOK) persist();
const requested = Number(new URLSearchParams(location.search).get('level'));
if (requested >= 1 && requested <= LEVELS.length && Number.isInteger(requested)) start(requested - 1);
requestAnimationFrame(frame);
