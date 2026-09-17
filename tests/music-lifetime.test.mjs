import test from 'node:test';
import assert from 'node:assert/strict';
import { Soundtrack } from '../src/music.ts';

test('a pause stops sound and resume starts from simulation time; retry starts at zero', () => {
  const events=[];
  const music = new Soundtrack();
  music.context = {
    destination: {},
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
      destination:{},createBufferSource:()=>({connect(){},disconnect(){},start(){},stop(){}})};
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
