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
