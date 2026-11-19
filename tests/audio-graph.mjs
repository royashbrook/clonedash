// A recording stand-in for OfflineAudioContext (#121): every node, property, connection, parameter
// call and source start/stop compose makes, in order and with its arguments, plus a hash of every
// buffer's samples as they stand when rendering starts. It renders nothing. It only knows the
// parts of the API compose uses; touching anything else throws, so nothing can drop out of the
// comparison unseen. This is graph/schedule/buffer-input equality, not PCM equality.
import { createHash } from "node:crypto";

const PARAMS = {
  compressor: ["threshold", "knee", "ratio", "attack", "release"],
  gain: ["gain"],
  oscillator: ["frequency", "detune"],
  filter: ["frequency", "Q", "gain", "detune"],
  delay: ["delayTime"],
  source: ["playbackRate", "detune"],
};
const PROPS = { oscillator: ["type"], filter: ["type"], source: ["buffer", "loop"] };
const PARAM_CALLS = ["setValueAtTime", "linearRampToValueAtTime", "exponentialRampToValueAtTime", "setTargetAtTime", "setValueCurveAtTime", "cancelScheduledValues"];

// recorder({ live }) adds what a live AudioContext has: `live.now()` is its clock, `live.resume`
// may replace resume (to hold it pending or reject it), and each source start is logged with the
// clock at the call, so a start in the past shows. The offline log is unchanged without it.
export function recorder({ live } = {}) {
  const log = [], buffers = [];
  let next = 0;
  const ref = (v) => (v && typeof v === "object" && "__id" in v ? v.__id : v);
  // a strict object: known fields only, anything else throws
  const strict = (target, what) =>
    new Proxy(target, {
      get(t, k) {
        if (k in t || typeof k === "symbol") return t[k];
        if (k === "then") return undefined; // a promise checking whether this is a thenable
        throw Error(`audio-graph: ${what} has no ${String(k)} in the recorder`);
      },
      set(t, k, v) {
        if (!t.__settable?.includes(k)) throw Error(`audio-graph: ${what}.${String(k)} cannot be set in the recorder`);
        log.push(["set", t.__id, k, ref(v)]);
        t[k] = v;
        return true;
      },
    });
  function param(owner, name) {
    const id = `${owner}.${name}`;
    const p = { __id: id, __settable: ["value"], value: 0 };
    for (const call of PARAM_CALLS) p[call] = (...args) => (log.push([call, id, ...args.map((a) => (ArrayBuffer.isView(a) ? hash(a) : a))]), proxy);
    const proxy = strict(p, id);
    return proxy;
  }
  function node(kind, args = []) {
    const id = `${kind}#${next++}`;
    log.push(["create", id, ...args]);
    const n = { __id: id, __settable: PROPS[kind] ?? [] };
    for (const name of PARAMS[kind] ?? []) n[name] = param(id, name);
    for (const name of PROPS[kind] ?? []) n[name] = undefined;
    n.connect = (target, ...rest) => (log.push(["connect", id, ref(target), ...rest]), target);
    n.disconnect = (...a) => (log.push(["disconnect", id, ...a.map(ref)]), undefined);
    if (kind === "oscillator" || kind === "source") {
      n.start = (...a) => (log.push(live ? ["start", id, ...a, "@", live.now()] : ["start", id, ...a]), undefined);
      n.stop = (...a) => (log.push(["stop", id, ...a]), undefined);
    }
    return strict(n, id);
  }
  function hash(view) {
    return createHash("sha256").update(Buffer.from(view.buffer, view.byteOffset, view.byteLength)).digest("hex");
  }
  class RecordingContext {
    constructor(channels, length, rate) {
      log.push(["context", channels, length, rate]);
      this.destination = strict({ __id: "destination" }, "destination");
      this.sampleRate = rate;
      this.length = length;
      this.__id = "context";
      if (live) {
        Object.defineProperty(this, "currentTime", { get: live.now });
        this.state = "suspended";
        this.resume = async () => {
          log.push(["resume"]);
          await (live.resume?.() ?? undefined);
          this.state = "running";
        };
        this.suspend = async () => (log.push(["suspend"]), (this.state = "suspended"));
        this.close = async () => (log.push(["close"]), (this.state = "closed"));
      }
      return strict(this, "context");
    }
    createDynamicsCompressor() { return node("compressor"); }
    createGain() { return node("gain"); }
    createOscillator() { return node("oscillator"); }
    createBiquadFilter() { return node("filter"); }
    createDelay(...a) { return node("delay", a); }
    createBufferSource() { return node("source"); }
    createBuffer(channels, length, rate) {
      const id = `buffer#${next++}`;
      log.push(["create", id, channels, length, rate]);
      const data = Array.from({ length: channels }, () => new Float32Array(length));
      buffers.push([id, data]);
      return strict({ __id: id, numberOfChannels: channels, length, sampleRate: rate, getChannelData: (c) => data[c] }, id);
    }
    async startRendering() {
      // the samples as compose left them, after every write
      for (const [id, data] of buffers) log.push(["samples", id, ...data.map(hash)]);
      log.push(["render"]);
      return log;
    }
  }
  return { RecordingContext: new Proxy(RecordingContext, {}), log };
}

// the whole log for one song, as one hash (the full log is kept for a diff when they differ)
export async function graphOf(compose, index) {
  const { RecordingContext } = recorder();
  const log = await compose(index, RecordingContext);
  return { log, hash: createHash("sha256").update(JSON.stringify(log)).digest("hex") };
}
