// Plays a loop live (#121, docs/loops.md "Playing"), through the game's own voices.
// One player owns the sound. A 25 ms timer schedules each step 120 ms ahead into this play's own
// output chain. STOP disconnects that chain at once, so steps already queued are not heard,
// retires every wobble modulator, and voids a resume that finishes after it.
//
// Wobble modulators: the voices start one LFO per bass beat and zero its depth at the beat's end
// (the offline render needs that, #122). Live, nothing would ever end them, so this player
// disconnects each from its filter and then stops it a little after its beat. A long session only
// ever holds the few beats in flight.
import { BEAT, seededNoise, voices } from "./voices.ts";
import type { Loop } from "./loop-schema.ts";

export const STEP = BEAT / 2;
const AHEAD = 0.12,
  TICK = 25,
  RETIRE_AFTER = 0.05;
const chordAt = (bar: number) => [0, -5, 3, -2][Math.floor(bar / 2) % 4];
type Voices = ReturnType<typeof voices>;

// One drum hit, and one step of a loop: what a loop plays at step `step` of bar `bar`, starting at
// `t`. The live player and a loop levels rendered song (music.ts composeLoop) both play steps through
// this, so a level sounds exactly like PLAY. Returns the steps wobble modulator, if it has one.
export function playDrum(play: Voices, kind: "kick" | "snare" | "hat", step: number, t: number) {
  if (kind === "kick") play.kick(t);
  else if (kind === "snare") play.snare(t);
  else play.hiss(t, step === 7 ? 0.12 : 0.045, 6500, step % 2 ? 0.035 : 0.055);
}
export function playLoopStep(play: Voices, loop: Loop, bar: number, step: number, t: number) {
  const root = loop.root + chordAt(bar);
  if (step % 8 === 0) play.pad(t, root, loop.drop); // each bar of 8 steps, in loops of any length (#140)
  const lfo = step % 2 === 0 ? play.bass(t, root, loop.wobble, loop.drop).lfo : null;
  for (const kind of ["kick", "snare", "hat"] as const) if (loop[kind].includes(step)) playDrum(play, kind, step, t);
  for (const degree of loop.notes[step]) play.lead(t, loop.root + 24 + degree, loop.drop, step % 2 === 0);
  return lfo;
}

type Modulator = { lfo: OscillatorNode; end: number };
type Session = { out: GainNode; play: Voices; modulators: Modulator[] };

export class LoopPlayer {
  private context?: AudioContext;
  private session?: Session;
  private preview?: Session;
  private timer = 0;
  private token = 0;
  private step = 0;
  private bar = 0;
  private next = 0;
  beat = BEAT;
  private marks: [number, number][] = [];
  playing = false;

  private loop: () => Loop;
  private onStep: (step: number) => void;
  private make: () => AudioContext;
  constructor(
    loop: () => Loop,
    onStep: (step: number) => void = () => {},
    make: () => AudioContext = () => new AudioContext(),
  ) {
    this.loop = loop;
    this.onStep = onStep;
    this.make = make;
  }

  // a fresh output chain, the same as a rendered song's: compressor, volume, echo
  private chain(c: AudioContext): Session {
    const out = c.createGain();
    out.connect(c.destination);
    const master = c.createDynamicsCompressor();
    master.threshold.value = -12;
    master.knee.value = 15;
    master.ratio.value = 5;
    const volume = c.createGain();
    volume.gain.value = 0.68;
    master.connect(volume).connect(out);
    const echo = c.createDelay(0.8),
      feedback = c.createGain();
    echo.delayTime.value = this.beat * 0.75;
    feedback.gain.value = 0.22;
    echo.connect(feedback).connect(echo);
    echo.connect(master);
    return { out, play: voices(c, master, seededNoise(c, 701), echo, this.beat), modulators: [] };
  }
  private async wake() {
    this.context ??= this.make();
    if (this.context.state === "suspended") await this.context.resume();
    return this.context;
  }

  async start() {
    this.stop();
    const token = ++this.token;
    const c = await this.wake();
    if (token !== this.token) return; // stopped while waking
    this.session = this.chain(c);
    this.playing = true;
    this.step = this.bar = 0;
    this.marks = [];
    this.next = c.currentTime + 0.06;
    this.timer = globalThis.setInterval(() => this.tick(), TICK) as unknown as number;
    this.tick();
  }
  // Silence, everywhere this player makes sound: the playing chain and the tapped-cell chain are
  // both cut at once, every modulator retired, and any wake still pending is voided.
  stop() {
    this.token++;
    globalThis.clearInterval(this.timer);
    this.timer = 0;
    for (const s of [this.session, this.preview]) if (s) this.retire(s, true);
    this.session = this.preview = undefined;
    if (this.playing) this.onStep(-1);
    this.playing = false;
  }
  // leaving the screen: silence, then let the context sleep
  async leave() {
    this.stop();
    if (this.context?.state === "running") await this.context.suspend();
  }
  async close() {
    this.stop();
    const c = this.context;
    this.context = undefined;
    await c?.close();
  }
  // how many wobble modulators are alive (the playing session's), for the lifetime checks
  get modulators() {
    return this.session?.modulators.length ?? 0;
  }

  // one tapped cell, heard at once
  async hear(kind: "note" | "kick" | "snare" | "hat", value: number) {
    const token = this.token;
    const c = await this.wake();
    if (token !== this.token) return; // a STOP or a new PLAY came while waking
    const s = this.session ?? (this.preview ??= this.chain(c)),
      loop = this.loop(),
      t = c.currentTime + 0.01;
    if (kind === "note") s.play.lead(t, loop.root + 24 + value, loop.drop, true);
    else playDrum(s.play, kind, value, t);
  }

  private playStep(s: Session, step: number, t: number) {
    const lfo = playLoopStep(s.play, this.loop(), this.bar, step, t);
    if (lfo) s.modulators.push({ lfo, end: t + this.beat });
  }
  private tick() {
    const s = this.session,
      c = this.context;
    if (!s || !c) return;
    // a stalled tab or a late timer never catches up: steps whose time has passed are skipped,
    // their place in the bar and the chord kept, and none of their voices is built
    while (this.next < c.currentTime) this.advance();
    while (this.next < c.currentTime + AHEAD) {
      // a loop cut shorter while it plays carries on from its start
      if (this.step >= this.loop().notes.length) this.step = 0;
      this.playStep(s, this.step, this.next);
      this.marks.push([this.next, this.step]);
      this.advance();
    }
    this.retire(s, false);
    let shown = -2;
    while (this.marks.length && this.marks[0][0] <= c.currentTime) shown = this.marks.shift()![1];
    if (shown > -2) this.onStep(shown);
  }
  private advance() {
    this.next += this.beat / 2;
    // a bar is 8 steps (the chord moves per bar); the loop wraps at its own length (#140)
    if (++this.step % 8 === 0) this.bar++;
    if (this.step >= this.loop().notes.length) this.step = 0;
  }
  // where the loop is: step in the bar and bar count (the chord follows the bar)
  get phase() {
    return { step: this.step, bar: this.bar, next: this.next };
  }
  // disconnect, then stop: a modulator never sits stopped while still feeding a filter (#122)
  private retire(s: Session, all: boolean) {
    const now = this.context?.currentTime ?? Infinity;
    s.modulators = s.modulators.filter((m) => {
      if (!all && m.end + RETIRE_AFTER > now) return true;
      m.lfo.disconnect();
      m.lfo.stop();
      return false;
    });
    if (all) s.out.disconnect();
  }
}
