import test from 'node:test';
import assert from 'node:assert/strict';
import { Soundtrack } from '../src/music.ts';
const createGain = () => ({connect(){},disconnect(){},gain:{setValueAtTime(){},linearRampToValueAtTime(){}}});

test('track changes fade, a delayed frame rejoins the run, and mute cuts even a fading tail', () => {
  const music = new Soundtrack(), starts = [], ends = [], gains = [];
  music.enabled = true;
  const c = music.context = { currentTime: 10, state: 'running', destination: {},
    createBufferSource: () => ({ connect(){}, disconnect(){}, start(_,at){starts.push(at);}, stop(at){ends.push(at);} }),
    createGain: () => {
      const ramps = [];
      const node = { ramps, connected: false, connect(){this.connected=true;}, disconnect(){this.connected=false;},
        gain: {setValueAtTime(){},cancelScheduledValues(){},linearRampToValueAtTime(v,t){ramps.push([v,t]);}} };
      gains.push(node); return node;
    } };
  music.buffers.set(109,{duration:60}); music.buffers.set(1,{duration:20});
  music.sync(109,true,5); music.sync(1,true,0,true);
  assert.deepEqual(ends,[10.04]); assert.deepEqual(gains[0].ramps.at(-1),[0,10.04]);
  assert.deepEqual(gains[1].ramps,[[1,10.008]]);
  c.currentTime += .02; music.sync(1,true,.02,true);
  assert.deepEqual(starts,[5,0]);
  c.currentTime += .5; music.sync(1,true,.07,true);
  assert.deepEqual(starts,[5,0,.07]);
  music.unlock(false);
  assert.ok(gains.every(g => !g.connected));
});

test('preparing the trail is silent; decoding it does not evict the menu', async () => {
  const music = new Soundtrack(), starts = [];
  music.enabled = true;
  music.context = {currentTime:0, createGain, destination:{}, createBufferSource: () => ({
    connect(){},disconnect(){},stop(){},start(_,at){starts.push(at);}
  })};
  music.buffers.set(109,{duration:30});
  let finish;
  music.load = () => new Promise(resolve => { finish=resolve; });
  music.prepare(2); finish({duration:10});
  await new Promise(resolve=>setImmediate(resolve));
  assert.deepEqual(starts,[]);
  music.sync(2,true,0,true); music.sync(109,true,14);
  assert.deepEqual(starts,[0,14]); assert.equal(music.pending.size,0);
});

test('a pause stops sound and resume starts from simulation time; retry starts at zero', () => {
  const events=[];
  const music = new Soundtrack();
  music.context = {
    destination: {},
    createGain, currentTime: 0,
    createBufferSource: () => ({connect(){},disconnect(){},start(...args){events.push(['start',...args]);},stop(){events.push(['stop']);}}),
  };
  music.enabled=true;
  music.buffers.set(0,{duration:25.6});
  music.sync(0,true,3.75);
  music.sync(0,false,3.75);
  music.sync(0,true,3.75);
  music.stop(); music.sync(0,true,0);
  assert.deepEqual(events,[['start',0,3.75],['stop'],['start',0,3.75],['stop'],['start',0,0]]);
});

test('disposing the soundtrack aborts an in-flight recording without starting a fallback', async () => {
  const originalFetch=globalThis.fetch;let signal;
  globalThis.fetch=async (_url,options)=>new Promise((_resolve,reject)=>{
    signal=options.signal;
    signal.addEventListener('abort',()=>reject(new DOMException('Aborted','AbortError')),{once:true});
  });
  try {
    const music=new Soundtrack();music.enabled=true;
    music.context={close:async()=>{}};
    music.sync(109,true,0);
    assert.equal(signal.aborted,false);
    music.dispose();
    await new Promise(resolve=>setImmediate(resolve));
    assert.equal(signal.aborted,true);
    assert.equal(music.pending.size,0);
    assert.equal(music.buffers.size,0);
    assert.equal(music.fallback,false);
  } finally {globalThis.fetch=originalFetch;}
});

test('a resume the close rejects after unmount is expected; one rejected while the game lives is not hidden', () => {
  // the resume's rejection handler, as the soundtrack attaches it
  const unlocked = () => { const music = new Soundtrack(); let handler;
    music.context = { resume: () => ({ catch: (fn) => { handler = fn; } }), close: async () => {} };
    music.unlock(true);
    return { music, handler }; };
  const closed = new DOMException('Context is closed', 'InvalidStateError');
  const gone = unlocked();
  assert.equal(typeof gone.handler, 'function', 'the resume has a rejection handler');
  gone.music.dispose(); // WebKit: the close rejects the pending resume
  assert.doesNotThrow(() => gone.handler(closed));
  const live = unlocked();
  assert.throws(() => live.handler(closed), (e) => e === closed, 'while the game lives the real error goes on');
  live.music.dispose();
});

test('recordings do not require the newer AbortSignal static helpers', async () => {
  const any=Object.getOwnPropertyDescriptor(AbortSignal,'any');
  const timeout=Object.getOwnPropertyDescriptor(AbortSignal,'timeout');
  const originalFetch=globalThis.fetch;
  const music=new Soundtrack();let requests=0;
  try {
    Object.defineProperty(AbortSignal,'any',{configurable:true,value:undefined});
    Object.defineProperty(AbortSignal,'timeout',{configurable:true,value:undefined});
    globalThis.fetch=async (_url,options)=>{
      requests++;assert(options.signal instanceof AbortSignal);
      return {ok:true,arrayBuffer:async()=>new ArrayBuffer(4)};
    };
    music.context={decodeAudioData:async()=>({duration:30}),close:async()=>{},
      destination:{},currentTime:0,createGain,createBufferSource:()=>({connect(){},disconnect(){},start(){},stop(){}})};
    music.enabled=true;music.sync(109,true,0);
    await new Promise(resolve=>setImmediate(resolve));
    assert.equal(requests,1);assert.equal(music.track,109);
    assert.equal(music.fallback,false);
  } finally {
    music.dispose();globalThis.fetch=originalFetch;
    Object.defineProperty(AbortSignal,'any',any);
    Object.defineProperty(AbortSignal,'timeout',timeout);
  }
});

test('a stalled recording request is aborted at its eight-second deadline and clears its timer', async () => {
  const originalFetch=globalThis.fetch,originalSet=globalThis.setTimeout,originalClear=globalThis.clearTimeout;
  const music=new Soundtrack();let deadline,delay,signal,cleared;
  try {
    globalThis.setTimeout=(callback,ms)=>{deadline=callback;delay=ms;return 123;};
    globalThis.clearTimeout=id=>{cleared=id;};
    globalThis.fetch=async (_url,options)=>new Promise((_resolve,reject)=>{
      signal=options.signal;
      signal.addEventListener('abort',()=>reject(new DOMException('Aborted','AbortError')),{once:true});
    });
    music.context={close:async()=>{}};music.enabled=true;music.sync(109,true,0);
    assert.equal(delay,8000);assert.equal(signal.aborted,false);
    deadline();assert.equal(signal.aborted,true);
    music.dispose(); // No fallback is needed after the owning screen unmounts.
    await new Promise(resolve=>setImmediate(resolve));
    assert.equal(cleared,123);assert.equal(music.pending.size,0);
  } finally {
    music.dispose();globalThis.fetch=originalFetch;
    globalThis.setTimeout=originalSet;globalThis.clearTimeout=originalClear;
  }
});
