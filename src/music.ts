import { recordingFor } from "./recordings.ts";
import { BEAT, seededNoise, voices } from "./voices.ts";
import { playLoopStep } from "./loop-player.ts";
import type { Loop } from "./loop-schema.ts";
// Original 150 BPM compositions: one block is an eighth note at 5 blocks/second.
// Render locally once per trail, then play a buffer. No network, samples or audio timer drift.
export const TRACKS = [
  {
    name: "First Spark",
    root: 40,
    melody: [12, 7, 10, 7, 15, 12, 7, 10],
    wobble: 2,
  },
  {
    name: "Step It Up",
    root: 42,
    melody: [0, 3, 7, 10, 12, 10, 7, 3],
    wobble: 3,
  },
  {
    name: "Air Time",
    root: 45,
    melody: [12, 15, 19, 22, 19, 15, 12, 10],
    wobble: 2,
  },
  {
    name: "Double Take",
    root: 38,
    melody: [7, 7, 10, 12, 3, 3, 7, 10],
    wobble: 4,
  },
  {
    name: "Sky Circuit",
    root: 43,
    melody: [19, 15, 12, 10, 7, 10, 12, 15],
    wobble: 3,
  },
  {
    name: "Switchcraft",
    root: 40,
    melody: [0, 12, 7, 19, 3, 15, 10, 22],
    wobble: 4,
  },
  {
    name: "Clone Dash",
    root: 41,
    melody: [12, 10, 7, 3, 0, 7, 10, 19],
    wobble: 6,
  },
  {
    name: "Gravity Flip",
    root: 44,
    melody: [0, 12, 3, 15, 7, 19, 15, 3],
    wobble: 4,
  },
  {
    name: "Air Steps",
    root: 46,
    melody: [0, 7, 12, 19, 22, 19, 15, 12],
    wobble: 3,
  },
];
const BARS = 16,
  LENGTH = BARS * 4 * BEAT;
export const trackName = (index: number) =>
  recordingFor(index)?.name ?? trackFor(index).name;
export function trackFor(index: number) {
  if (TRACKS[index]) return TRACKS[index];
  // A unique two-note opening for each of the 100 custom originals, then a seeded riff.
  const n = index - TRACKS.length,
    scale = [0, 3, 5, 7, 10, 12, 15, 17, 19, 22];
  let seed = 3571 + n * 7919;
  const melody = [scale[n % 10], scale[Math.floor(n / 10) % 10]];
  while (melody.length < 8) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    melody.push(scale[seed % scale.length]);
  }
  return {
    name: `Original ${n + 1}`,
    root: 38 + (n % 9),
    melody,
    wobble: [2, 3, 4, 6][n % 4],
  };
}
export async function compose(
  index: number,
  Offline = globalThis.OfflineAudioContext,
) {
  const song = trackFor(index);
  const c = new Offline(2, Math.ceil(LENGTH * 44100), 44100);
  const master = c.createDynamicsCompressor();
  master.threshold.value = -12;
  master.knee.value = 15;
  master.ratio.value = 5;
  const volume = c.createGain();
  volume.gain.value = 0.68;
  master.connect(volume).connect(c.destination);
  const noise = seededNoise(c, 701 + index);
  const echo = c.createDelay(0.8),
    feedback = c.createGain();
  echo.delayTime.value = BEAT * 0.75;
  feedback.gain.value = 0.22;
  echo.connect(feedback).connect(echo);
  echo.connect(master);
  const { kick, snare, hiss, pad, bass, lead } = voices(c, master, noise, echo);
  for (let bar = 0; bar < BARS; bar++) {
    const t = bar * 4 * BEAT,
      chord = [0, -5, 3, -2][Math.floor(bar / 2) % 4],
      drop = bar >= 2 && bar !== 8 && bar !== 9;
    pad(t, song.root + chord, drop);
    kick(t);
    kick(t + 2.75 * BEAT, !drop);
    if (drop) kick(t + 1.5 * BEAT, true);
    snare(t + 2 * BEAT);
    for (let j = 0; j < 8; j++)
      hiss(
        t + (j * BEAT) / 2,
        j === 7 ? 0.12 : 0.045,
        6500,
        j % 2 ? 0.035 : 0.055,
      );
    if (bar % 4 === 3)
      for (let j = 0; j < 4; j++)
        hiss(t + (3 + j / 4) * BEAT, 0.05, 5000, 0.065);
    for (let j = 0; j < 4; j++) bass(t + j * BEAT, song.root + chord, song.wobble, drop);
    for (let j = 0; j < 8; j++) {
      if (bar < 2 && j % 2 && index < TRACKS.length) continue;
      lead(t + (j * BEAT) / 2, song.root + 24 + song.melody[(j + (bar % 2) * 2) % 8], drop, j % 2 === 0);
    }
    if (bar % 8 === 7) hiss(t + 3 * BEAT, BEAT, 2800, 0.15);
  }
  return c.startRendering();
}
// What a level plays: a numbered song, or a custom level's own loop (#121). A buffer is kept under
// what it sounds like: the song's number, or the loop's whole content, so two levels with
// different loops never share one, whatever their ids.
export type Music = number | Loop;
const keyOf = (music: Music) => (typeof music === "number" ? music : `l${JSON.stringify(music)}`);

// A loop level's song (#121, docs/loops.md): the loop exactly as PLAY plays it, through the same step
// function as the live player, then repeated by the looping source. It renders a whole number of
// loop passes and of the 64-step chord cycle, at least 16 bars, so the repeat lands where PLAY's
// would: 128 steps (25.6 s) for 8, 16 and 32 step loops, 192 (38.4 s) for 24 (#140).
const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a);
export const loopSongSteps = (steps: number) => Math.max(BARS * 8, (64 * steps) / gcd(64, steps));
export async function composeLoop(loop: Loop, Offline = globalThis.OfflineAudioContext) {
  const steps = loop.notes.length,
    total = loopSongSteps(steps);
  const c = new Offline(2, Math.ceil(((total * BEAT) / 2) * 44100), 44100);
  const master = c.createDynamicsCompressor();
  master.threshold.value = -12;
  master.knee.value = 15;
  master.ratio.value = 5;
  const volume = c.createGain();
  volume.gain.value = 0.68;
  master.connect(volume).connect(c.destination);
  const noise = seededNoise(c, 701);
  const echo = c.createDelay(0.8),
    feedback = c.createGain();
  echo.delayTime.value = BEAT * 0.75;
  feedback.gain.value = 0.22;
  echo.connect(feedback).connect(echo);
  echo.connect(master);
  const play = voices(c, master, noise, echo);
  for (let g = 0; g < total; g++) playLoopStep(play, loop, Math.floor(g / 8), g % steps, (g * BEAT) / 2);
  return c.startRendering();
}

export class Soundtrack {
  enabled = false;
  buffers = new Map<number | string, AudioBuffer>();
  pending = new Set<number | string>();
  source: AudioBufferSourceNode | null = null;
  context?: AudioContext;
  track: number | string = -1;
  intent: { music: Music; running: boolean; offset: number } = { music: 0, running: false, offset: 0 };
  private disposed = false;
  private request: AbortController | null = null;
  fallback = false;
  private async load(music: Music) {
    if (typeof music !== "number") return composeLoop(music);
    const index = music,
      song = recordingFor(index);
    if (song && this.context) {
      // One pending load, with cancellation usable on older Safari too.
      const request = (this.request = new AbortController());
      const deadline = setTimeout(() => request.abort(), 8000);
      try {
        const response = await fetch(`/music/${song.file}.mp3`, {
          signal: request.signal,
        });
        if (!response.ok) throw Error("Recording unavailable");
        return await this.context.decodeAudioData(await response.arrayBuffer());
      } catch {
        if (this.disposed) throw Error("Soundtrack disposed");
        // A failed download must not silence a run. Originals remain available offline.
        this.fallback = true;
        return compose((index - 109) % TRACKS.length);
      } finally {
        clearTimeout(deadline);
        this.request = null;
      }
    }
    return compose(index);
  }
  unlock(enabled = this.enabled) {
    if (this.disposed) return;
    this.enabled = enabled;
    if (!enabled) {
      this.stop();
      return;
    }
    try {
      this.context ??= new AudioContext();
      // a resume still pending when the game unmounts is rejected by the close (WebKit): expected
      this.context.resume().catch((e) => {
        if (!this.disposed) throw e;
      });
      this.sync(this.intent.music, this.intent.running, this.intent.offset);
    } catch {
      this.enabled = false;
    }
  }
  stop() {
    if (this.source) {
      this.source.stop();
      this.source.disconnect();
      this.source = null;
    }
  }
  dispose() {
    this.disposed = true;
    this.request?.abort();
    this.enabled = false;
    this.stop();
    this.buffers.clear();
    void this.context?.close();
  }
  // The page hid or lost focus: stop, and drop the wish to play, so a render that finishes while
  // no frame runs (a hidden page may get none) cannot start sound again. The next frame that wants
  // music says so through sync.
  interrupt() {
    this.intent = { ...this.intent, running: false };
    this.stop();
  }
  sync(music: Music, running: boolean, offset: number) {
    if (this.disposed) return;
    this.intent = { music, running, offset };
    if (!this.enabled || !this.context || !running) {
      this.stop();
      return;
    }
    const key = keyOf(music);
    if (this.source && this.track === key) return;
    this.stop();
    if (!this.buffers.has(key)) {
      // One render at a time; a big level library must not turn into a big audio cache.
      if (!this.pending.size) {
        this.pending.add(key);
        // the music as it is now: the level may change while its song renders
        const snapshot = typeof music === "number" ? music : structuredClone(music);
        this.load(snapshot)
          .then((buffer) => {
            this.pending.delete(key);
            if (this.disposed) return;
            // Long recordings decode to tens of MB. Retain only the current track.
            this.buffers.clear();
            this.buffers.set(key, buffer);
            const i = this.intent;
            this.sync(i.music, i.running, i.offset);
          })
          .catch(() => {
            this.pending.delete(key);
            if (this.disposed) return;
            // a failure silences only the music it was for: if the level moved on, play that
            const i = this.intent;
            if (keyOf(i.music) !== key) this.sync(i.music, i.running, i.offset);
            else this.enabled = false;
          });
      }
      return;
    }
    this.source = this.context.createBufferSource();
    this.source.buffer = this.buffers.get(key)!;
    this.source.loop = true;
    this.source.connect(this.context.destination);
    this.source.start(0, Math.max(0, offset) % this.source.buffer.duration);
    this.track = key;
  }
}
