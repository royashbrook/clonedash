import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createState, object, step, validateLevel } from '../src/engine.ts';
import { encodeLevel, decodeLevel } from '../src/transfer.ts';

const mark = (x, y, group) => ({ ...object('block', x, y), group, noTouch: true });
const follow = (target, leader, axis) => ({ ...object('follow-trigger', 3, 0), target, ...(leader && {leader}), ...(axis && {axis}) });
const level = objects => ({ name:'Follow', length:80, height:10, objects });
const near = (a,b) => assert.ok(Math.abs(a-b)<0.00001, a+' != '+b);

test('player follow preserves spacing and applies only the chosen axes; restart leaves the draft intact', () => {
  for (const axis of [undefined,'x','y']) {
    const l=level([follow(1, undefined, axis),mark(9,4,1),mark(12,6,1)]);
    validateLevel(l);
    const s=createState(l); while (!s.fx.fired[0]) step(s,false);
    const base=[s.x,s.y]; let previous;
    for(let n=0;n<12;n++){ previous=[s.x,s.y]; step(s,true); }
    const [a,b]=s.level.objects.slice(1);
    near(a.x,9+(axis==='y'?0:previous[0]-base[0])); near(a.y,4+(axis==='x'?0:previous[1]-base[1]));
    near(b.x-a.x,3); near(b.y-a.y,2); assert.equal(createState(l).level.objects[1].x,9);
  }
});
test('follow chains use authored group anchors; a loop or missing source cannot replace a working binding', () => {
  const s=createState(level([follow(2,1),follow(1),follow(1,2),follow(1,9),mark(15,2,1),mark(23,4,2)]));
  while (!s.fx.fired[0]) step(s,false); for(let n=0;n<30;n++)step(s,false);
  assert.ok(s.level.objects[4].x>16); near(s.level.objects[5].x-s.level.objects[4].x,8);
});
test('shared follow settings survive the codec; invalid IDs, axes and fields on other objects are refused',async()=>{
  const l=level([follow(3,5,'y')]); assert.deepEqual((await decodeLevel(await encodeLevel(l))).objects,l.objects);
  for(const piece of [follow(1,100),follow(1,1.5),follow(1,2,'z'),{...mark(7,1,1),leader:1},{...follow(1,2),duration:1}])
    assert.throws(()=>validateLevel(level([piece])));
});
