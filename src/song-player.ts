import { timeline, type Arrangement } from "./arrangement.ts";
import { playLoopStep } from "./loop-player.ts";
import { voices, seededNoise } from "./voices.ts";

// The editor and the trail use the same audio clock. Only the next 120ms of notes is scheduled.
export function playSong(
  c: AudioContext,
  song: Arrangement,
  offset: number,
  repeat: boolean,
  done = () => {},
) {
  const order = timeline(song),
    beat = 60 / song.bpm,
    step = beat / 2;
  const start = c.currentTime - offset,
    output = c.createGain(),
    master = c.createDynamicsCompressor();
  master.threshold.value = -12;
  master.knee.value = 15;
  master.ratio.value = 5;
  master.connect(output).connect(c.destination);
  output.gain.setValueAtTime(0, c.currentTime);
  output.gain.linearRampToValueAtTime(0.68, c.currentTime + 0.008);
  const echo = c.createDelay(1),
    feedback = c.createGain();
  echo.delayTime.value = beat * 0.75;
  feedback.gain.value = 0.22;
  echo.connect(feedback).connect(echo);
  echo.connect(master);
  const sound = voices(c, master, seededNoise(c, 701), echo, beat);
  // The first rendered game frame can already be a few milliseconds into beat one.
  let i = Math.max(0, Math.ceil((offset - 0.025) / step));
  let live: { node: OscillatorNode; end: number }[] = [];
  let stopped = false;
  function stop(fade = false, finished = () => {}) {
    if (stopped) return;
    stopped = true;
    clearInterval(timer);
    if (fade && c.state === "running") {
      output.gain.cancelScheduledValues(c.currentTime);
      output.gain.setTargetAtTime(0, c.currentTime, 0.008);
      setTimeout(() => { output.disconnect(); finished(); }, 40);
    } else { output.disconnect(); finished(); }
    echo.disconnect();
    feedback.disconnect();
    for (const { node } of live) {
      node.disconnect();
      node.stop();
    }
    live = [];
  }
  function tick() {
    const now = c.currentTime;
    if (!repeat && now >= start + order.length * step) {
      stop();
      done();
      return;
    }
    live = live.filter(({ node, end }) => {
      if (end > now) return true;
      node.disconnect();
      node.stop();
      return false;
    });
    i = Math.max(i, Math.ceil((now - start - 0.025) / step));
    while ((repeat || i < order.length) && start + i * step < now + 0.12) {
      const pos = i % order.length,
        { loop, step: local } = order[pos],
        at = Math.max(now, start + i * step);
      const lfo = playLoopStep(sound, loop, Math.floor(pos / 8), local, at);
      if (lfo) live.push({ node: lfo, end: at + beat + 0.05 });
      i++;
    }
  }
  const timer = globalThis.setInterval(tick, 25);
  tick();
  return Object.assign(stop, { output });
}
