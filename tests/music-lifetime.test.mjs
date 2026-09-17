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
