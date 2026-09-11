// Original 150 BPM compositions: one block is one beat at 2.5 blocks/second.
// Render locally once per trail, then play a buffer. No network, samples or audio timer drift.
export const TRACKS = [
  { name: 'First Spark', root: 40, melody: [12, 7, 10, 7, 15, 12, 7, 10], wobble: 2 },
  { name: 'Step It Up', root: 42, melody: [0, 3, 7, 10, 12, 10, 7, 3], wobble: 3 },
  { name: 'Air Time', root: 45, melody: [12, 15, 19, 22, 19, 15, 12, 10], wobble: 2 },
  { name: 'Double Take', root: 38, melody: [7, 7, 10, 12, 3, 3, 7, 10], wobble: 4 },
  { name: 'Sky Circuit', root: 43, melody: [19, 15, 12, 10, 7, 10, 12, 15], wobble: 3 },
  { name: 'Switchcraft', root: 40, melody: [0, 12, 7, 19, 3, 15, 10, 22], wobble: 4 },
  { name: 'Clone Dash', root: 41, melody: [12, 10, 7, 3, 0, 7, 10, 19], wobble: 6 },
];
const BEAT = .4, BARS = 16, LENGTH = BARS * 4 * BEAT;
const hz = n => 440 * 2 ** ((n - 69) / 12);
export async function compose(index, Offline = globalThis.OfflineAudioContext) {
  const song = TRACKS[index % TRACKS.length];
  const c = new Offline(2, Math.ceil(LENGTH * 44100), 44100);
  const master = c.createDynamicsCompressor(); master.threshold.value = -12; master.knee.value = 15; master.ratio.value = 5;
  const volume = c.createGain(); volume.gain.value = .68; master.connect(volume).connect(c.destination);
  const noise = c.createBuffer(1, 44100, 44100), data = noise.getChannelData(0);
  let seed = 701 + index;
  for (let i = 0; i < data.length; i++) { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; data[i] = seed / 2147483648 - 1; }
  function envelope(t, duration, amplitude, destination = master) {
    const g = c.createGain(); g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(amplitude, t + .008); g.gain.exponentialRampToValueAtTime(.0001, t + duration); g.connect(destination); return g;
  }
  function note(freq, t, duration, amplitude, type = 'triangle', destination = master) {
    const o = c.createOscillator(); o.type = type; o.frequency.value = freq; o.connect(envelope(t, duration, amplitude, destination)); o.start(t); o.stop(t + duration); return o;
  }
  function hiss(t, duration, frequency, amplitude) {
    const s = c.createBufferSource(), f = c.createBiquadFilter(); s.buffer = noise; f.type = 'highpass'; f.frequency.value = frequency;
    s.connect(f).connect(envelope(t, duration, amplitude)); s.start(t); s.stop(t + duration);
  }
  function kick(t, soft = false) {
    const o = note(150, t, .3, soft ? .3 : .65, 'sine'); o.frequency.exponentialRampToValueAtTime(44, t + .12);
    hiss(t, .025, 1600, .04);
  }
  function snare(t) { hiss(t, .19, 1100, .25); note(185, t, .1, .2, 'triangle'); }
  const echo = c.createDelay(.8), feedback = c.createGain(); echo.delayTime.value = BEAT * .75; feedback.gain.value = .22; echo.connect(feedback).connect(echo); echo.connect(master);
  for (let bar = 0; bar < BARS; bar++) {
    const t = bar * 4 * BEAT, chord = [0, -5, 3, -2][Math.floor(bar / 2) % 4], drop = bar >= 2 && bar !== 8 && bar !== 9;
    const padFilter = c.createBiquadFilter(); padFilter.type = 'lowpass'; padFilter.frequency.value = drop ? 800 : 1400; padFilter.connect(master);
    for (const degree of [0, 3, 7]) note(hz(song.root + chord + degree + 12), t, 4 * BEAT - .02, .022, 'sawtooth', padFilter);
    kick(t); kick(t + 2.75 * BEAT, !drop);
    if (drop) kick(t + 1.5 * BEAT, true);
    snare(t + 2 * BEAT);
    for (let j = 0; j < 8; j++) hiss(t + j * BEAT / 2, j === 7 ? .12 : .045, 6500, j % 2 ? .035 : .055);
    if (bar % 4 === 3) for (let j = 0; j < 4; j++) hiss(t + (3 + j / 4) * BEAT, .05, 5000, .065);
    for (let j = 0; j < 4; j++) {
      const at = t + j * BEAT, f = c.createBiquadFilter(); f.type = 'lowpass'; f.Q.value = 5;
      f.frequency.setValueAtTime(140, at); f.frequency.exponentialRampToValueAtTime(drop ? 1900 : 450, at + .055); f.frequency.exponentialRampToValueAtTime(100, at + BEAT - .02);
      const lfo = c.createOscillator(), depth = c.createGain(); lfo.frequency.value = song.wobble / BEAT; depth.gain.value = drop ? 160 : 40; lfo.connect(depth).connect(f.frequency); lfo.start(at); lfo.stop(at + BEAT);
      f.connect(master);
      note(hz(song.root + chord), at, BEAT - .03, drop ? .2 : .09, 'sawtooth', f);
      note(hz(song.root + chord - 12), at, BEAT - .03, .18, 'sine');
    }
    for (let j = 0; j < 8; j++) {
      if (bar < 2 && j % 2) continue;
      const at = t + j * BEAT / 2, pitch = song.root + 24 + song.melody[(j + bar % 2 * 2) % 8];
      const out = c.createGain(); out.gain.value = 1; out.connect(master); out.connect(echo);
      note(hz(pitch), at, BEAT * .42, drop ? .055 : .04, 'triangle', out);
      if (drop && j % 2 === 0) note(hz(pitch) * 1.003, at, BEAT * .3, .018, 'sawtooth', out);
    }
    if (bar % 8 === 7) hiss(t + 3 * BEAT, BEAT, 2800, .15);
  }
  return c.startRendering();
}
export class Soundtrack {
  constructor() { this.enabled = false; this.buffers = new Map(); this.pending = new Set(); this.source = null; this.track = -1; this.intent = { index: 0, running: false, offset: 0 }; }
  unlock(enabled = this.enabled) {
    this.enabled = enabled;
    if (!enabled) { this.stop(); return; }
    try { this.context ??= new AudioContext(); void this.context.resume(); this.sync(this.intent.index, this.intent.running, this.intent.offset); } catch { this.enabled = false; }
  }
  stop() { if (this.source) { this.source.stop(); this.source.disconnect(); this.source = null; } }
  sync(index, running, offset) {
    this.intent = { index, running, offset };
    if (!this.enabled || !this.context || !running) { this.stop(); return; }
    if (this.source && this.track === index) return;
    this.stop();
    if (!this.buffers.has(index)) {
      if (!this.pending.has(index)) { this.pending.add(index); compose(index).then(buffer => { this.pending.delete(index); this.buffers.set(index, buffer); const i = this.intent; this.sync(i.index, i.running, i.offset); }).catch(() => this.pending.delete(index)); }
      return;
    }
    this.source = this.context.createBufferSource(); this.source.buffer = this.buffers.get(index); this.source.loop = true; this.source.connect(this.context.destination); this.source.start(0, Math.max(0, offset) % this.source.buffer.duration); this.track = index;
  }
}
