// The song voices (#121): the instruments compose arranges into every synthesized song, shared so
// the loop maker plays the same sounds live. Building the voices creates no audio node; each call
// creates exactly what compose created inline before they moved here, in the same order, so every
// song's graph, schedule and noise stay as frozen (tests/compose-graph.test.mjs).
export const BEAT = 0.4;
export const hz = (n: number) => 440 * 2 ** ((n - 69) / 12);

// one second of seeded noise for the hats and snares: the same seed is the same noise, every time
export function seededNoise(c: BaseAudioContext, start: number) {
  const noise = c.createBuffer(1, 44100, 44100),
    data = noise.getChannelData(0);
  let seed = start;
  for (let i = 0; i < data.length; i++) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    data[i] = seed / 2147483648 - 1;
  }
  return noise;
}

export function voices(c: BaseAudioContext, master: AudioNode, noise: AudioBuffer, echo: AudioNode, beat = BEAT) {
  function envelope(t: number, duration: number, amplitude: number, destination: AudioNode = master) {
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(amplitude, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    g.connect(destination);
    return g;
  }
  function note(
    freq: number,
    t: number,
    duration: number,
    amplitude: number,
    type: OscillatorType = "triangle",
    destination: AudioNode = master,
  ) {
    const o = c.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    o.connect(envelope(t, duration, amplitude, destination));
    o.start(t);
    o.stop(t + duration);
    return o;
  }
  function hiss(t: number, duration: number, frequency: number, amplitude: number) {
    const s = c.createBufferSource(),
      f = c.createBiquadFilter();
    s.buffer = noise;
    f.type = "highpass";
    f.frequency.value = frequency;
    s.connect(f).connect(envelope(t, duration, amplitude));
    s.start(t);
    s.stop(t + duration);
  }
  function kick(t: number, soft = false) {
    const o = note(150, t, 0.3, soft ? 0.3 : 0.65, "sine");
    o.frequency.exponentialRampToValueAtTime(44, t + 0.12);
    hiss(t, 0.025, 1600, 0.04);
  }
  function snare(t: number) {
    hiss(t, 0.19, 1100, 0.25);
    note(185, t, 0.1, 0.2, "triangle");
  }
  // a bar's pad: the chord's three notes through one lowpass
  function pad(t: number, root: number, drop: boolean) {
    const padFilter = c.createBiquadFilter();
    padFilter.type = "lowpass";
    padFilter.frequency.value = drop ? 800 : 1400;
    padFilter.connect(master);
    for (const degree of [0, 3, 7]) note(hz(root + degree + 12), t, 4 * beat - 0.02, 0.022, "sawtooth", padFilter);
  }
  // one beat of wobble bass and its sub. The LFO is not stopped at the beat's end: its depth goes
  // to zero instead, because a stopped source still feeding the filter's frequency closed WebKit's
  // offline render in our tests (#122). A live player retires the returned LFO itself.
  function bass(at: number, root: number, wobble: number, drop: boolean) {
    const f = c.createBiquadFilter();
    f.type = "lowpass";
    f.Q.value = 5;
    f.frequency.setValueAtTime(140, at);
    f.frequency.exponentialRampToValueAtTime(drop ? 1900 : 450, at + 0.055);
    f.frequency.exponentialRampToValueAtTime(100, at + beat - 0.02);
    const lfo = c.createOscillator(),
      depth = c.createGain();
    lfo.frequency.value = wobble / beat;
    depth.gain.value = drop ? 160 : 40;
    lfo.connect(depth).connect(f.frequency);
    lfo.start(at);
    depth.gain.setValueAtTime(0, at + beat);
    f.connect(master);
    note(hz(root), at, beat - 0.03, drop ? 0.2 : 0.09, "sawtooth", f);
    note(hz(root - 12), at, beat - 0.03, 0.18, "sine");
    return { lfo, depth };
  }
  // one melody step: the lead, and in the drop a detuned saw an octave of brightness above it
  function lead(at: number, pitch: number, drop: boolean, accent: boolean) {
    const out = c.createGain();
    out.gain.value = 1;
    out.connect(master);
    out.connect(echo);
    note(hz(pitch), at, beat * 0.42, drop ? 0.055 : 0.04, "triangle", out);
    if (drop && accent) note(hz(pitch) * 1.003, at, beat * 0.3, 0.018, "sawtooth", out);
  }
  return { note, hiss, kick, snare, pad, bass, lead };
}
