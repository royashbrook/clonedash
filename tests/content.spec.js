import { test, expect } from '@playwright/test';
import { COURSES } from '../src/courses.ts';
import { RECORDINGS } from '../src/recordings.ts';
import { courseInput } from './course-input.mjs';
import { AVATAR } from '../src/render.ts';

const save = () => ({ version: 1, best: {0:100,8:52}, sound:false,
  draft: {name:'Keep my draft',length:40,objects:[],song:31},
  customLevels:[{id:1,level:{name:'Keep my draft',length:40,objects:[],song:31}}],activeLevel:1 });
async function seed(page) {
  await page.addInitScript(s => { if (!localStorage.getItem('clonedash.v1')) localStorage.setItem('clonedash.v1',JSON.stringify(s)); },save());
}
test('ranked courses show durations, keep warmups and remove the misleading friend button', async ({page}) => {
  await page.goto('/');
  await expect(page.locator('.course-heading')).toHaveText([
    'EasyRoom to learn the rhythm', 'MediumLonger combinations and gravity changes',
    'HardTighter timing and faster transitions','WarmupsShort introductions to each shape',
  ]);
  await expect(page.locator('.level-card')).toHaveCount(18);
  await expect(page.locator('#play')).toContainText('PULSEWAY');
  await expect(page.locator('#share')).toHaveCount(0);
  const play=await page.locator('#play').boundingBox();
  expect(play.y+play.height).toBeLessThanOrEqual(430);
  await page.screenshot({path:`test-results/courses-home-${test.info().project.name}.png`});
  for(const [width,height] of [[430,932],[932,430],[360,640]]) {
    await page.setViewportSize({width,height});
    expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBe(width);
    for(const name of ['Pulseway','Switchyard','Afterburn']) {
      const card=page.getByRole('button',{name:`Play ${name}`,exact:true});
      await card.scrollIntoViewIfNeeded();
      await expect(card.locator('.course-meta')).toBeVisible();
      expect((await card.boundingBox()).height).toBeGreaterThanOrEqual(44);
    }
  }
});
test('a built-in copy opens independently in the editor with song, progress and prior draft intact', async ({page}) => {
  await seed(page); await page.goto('/');
  await page.getByRole('button',{name:'Play Afterburn',exact:true}).click();
  await page.locator('#pause').click();
  await page.getByRole('button',{name:'EDIT A COPY',exact:true}).click();
  await expect(page.locator('#editor')).toBeVisible();
  await expect(page.locator('#level-title')).toHaveValue('Afterburn (copy)');
  let saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('clonedash.v1')));
  expect(saved.customLevels[0]).toEqual(save().customLevels[0]);
  expect(saved.best[0]).toBe(100); expect(saved.best[8]).toBe(52);
  expect(saved.draft).toEqual({...COURSES[8],name:'Afterburn (copy)'});
  expect(saved.activeLevel).toBe(2);
  await page.locator('#level-title').fill('My remix'); await page.locator('#level-title').blur();
  await page.reload(); await page.locator('#my-levels').click();
  await expect(page.getByRole('heading',{name:'Keep my draft',exact:true})).toBeVisible();
  await expect(page.getByRole('heading',{name:'My remix',exact:true})).toBeVisible();
});
test('a custom run can be copied from its completion sheet', async ({page}) => {
  await seed(page); await page.clock.install(); await page.goto('/');
  await page.locator('#editor-open').click(); await page.locator('#test-level').click();
  await page.clock.runFor(9000);
  await expect(page.getByRole('heading',{name:'Level Complete!',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'EDIT A COPY',exact:true}).click();
  const s=await page.evaluate(()=>JSON.parse(localStorage.getItem('clonedash.v1')));
  expect(s.customLevels).toHaveLength(2); expect(s.draft.song).toBe(31);
  expect(s.customLevels[0]).toEqual(save().customLevels[0]);
  expect(s.best).toEqual(save().best);
});
test('a silently refused copy leaves the current run and every saved byte alone', async ({page}) => {
  await seed(page); await page.clock.install(); await page.goto('/');
  await page.getByRole('button',{name:'Play Pulseway',exact:true}).click();
  await page.locator('#pause').click();
  const before=await page.evaluate(()=>localStorage.getItem('clonedash.v1'));
  await page.evaluate(()=>{Storage.prototype.setItem=()=>{};});
  await page.getByRole('button',{name:'EDIT A COPY',exact:true}).click();
  await expect(page.locator('#sheet')).toContainText('could not confirm');
  await expect(page.locator('#editor')).toBeHidden();
  expect(await page.evaluate(()=>localStorage.getItem('clonedash.v1'))).toBe(before);
});
test('every licensed recording decodes to distinct non-silent audio and has offline credits', async ({page}) => {
  await page.goto('/');
  const result=await page.evaluate(async tracks=>{
    const context=new AudioContext(),results=[];
    try { for(const song of tracks) {
      const response=await fetch(`/music/${song.file}.mp3`);
      if(!response.ok) throw Error(`Missing ${song.file}`);
      const buffer=await context.decodeAudioData(await response.arrayBuffer());
      const pcm=buffer.getChannelData(0); let energy=0,peak=0,signature=0;
      for(let i=0;i<pcm.length;i+=10) { energy+=pcm[i]**2; peak=Math.max(peak,Math.abs(pcm[i])); signature+=pcm[i]*(i%997); }
      results.push({duration:buffer.duration,rms:Math.sqrt(energy/(pcm.length/10)),peak,signature});
    } } finally { await context.close(); }
    return results;
  },RECORDINGS);
  for(const r of result) { expect(r.duration).toBeGreaterThan(29); expect(r.rms).toBeGreaterThan(.02); expect(r.peak).toBeLessThan(1); }
  expect(new Set(result.map(r=>r.signature)).size).toBe(9);
  await page.locator('#about').click();
  await expect(page.getByRole('link',{name:'Songs and music credits'})).toHaveAttribute('href','/music/credits.html');
});
test('without newer AbortSignal helpers, a recorded soundtrack pauses, resumes at run time, and restarts at zero', async ({page}) => {
  await page.addInitScript(()=>{
    Object.defineProperty(AbortSignal,'any',{configurable:true,value:undefined});
    Object.defineProperty(AbortSignal,'timeout',{configurable:true,value:undefined});
    window.recordedStarts=[];window.recordedStops=0;
    const start=AudioBufferSourceNode.prototype.start,stop=AudioBufferSourceNode.prototype.stop;
    AudioBufferSourceNode.prototype.start=function(...args){if(this.loop&&this.buffer?.duration>29)window.recordedStarts.push({offset:args[1]??0,duration:this.buffer.duration});return start.apply(this,args);};
    AudioBufferSourceNode.prototype.stop=function(...args){if(this.loop&&this.buffer?.duration>29)window.recordedStops++;return stop.apply(this,args);};
  });
  await page.goto('/'); await page.locator('#sound').click();
  await expect.poll(()=>page.evaluate(()=>window.recordedStarts.length)).toBeGreaterThan(0);
  await page.getByRole('button',{name:'Play Pulseway',exact:true}).click();
  await expect.poll(()=>page.locator('#run-progress').evaluate(e=>e.value)).toBeGreaterThan(.3);
  await page.locator('#pause').click();
  const stops=await page.evaluate(()=>window.recordedStops); expect(stops).toBeGreaterThan(0);
  const count=await page.evaluate(()=>window.recordedStarts.length);
  await page.waitForTimeout(250);expect(await page.evaluate(()=>window.recordedStarts.length)).toBe(count);
  await page.getByRole('button',{name:'RESUME',exact:true}).click();
  await expect.poll(()=>page.evaluate(()=>window.recordedStarts.length)).toBeGreaterThan(count);
  expect(await page.evaluate(()=>window.recordedStarts.at(-1).offset)).toBeGreaterThan(.1);
  await page.locator('#pause').click();await page.getByRole('button',{name:'RESTART LEVEL',exact:true}).click();
  await expect.poll(()=>page.evaluate(()=>window.recordedStarts.at(-1).offset)).toBeLessThan(.1);
});

for (const index of [0,8]) test(`full course through actual keyboard input: ${COURSES[index].name}`,async({page})=>{
  const level=COURSES[index];let held=false;
  // Observe rendered position and plane tilt, just as a player sees them. An
  // open-loop key schedule drifts with RAF alignment, so use visual feedback.
  await page.addInitScript(()=>{
    const translate=CanvasRenderingContext2D.prototype.translate,rotate=CanvasRenderingContext2D.prototype.rotate;
    CanvasRenderingContext2D.prototype.translate=function(x,y){window.playerPaint={x,y};return translate.call(this,x,y);};
    CanvasRenderingContext2D.prototype.rotate=function(angle){window.playerTilt=angle;return rotate.call(this,angle);};
  });
  await page.clock.install();await page.goto('/');await page.clock.runFor(32);
  await page.getByRole('button',{name:`Play ${level.name}`,exact:true}).click();
  await page.clock.runFor(32);
  for(let tick=0;tick<1600;tick++) {
    const paint=await page.evaluate(()=>({
      progress:document.querySelector('#run-progress').value,
      name:document.querySelector('#level-name').textContent,
      attempt:document.querySelector('#attempt').textContent,
      point:window.playerPaint,tilt:window.playerTilt,
      complete:document.querySelector('#sheet-title')?.textContent==='Level Complete!',
    }));
    if(paint.complete) break;
    expect(paint.attempt,`x=${1+paint.progress/100*(level.length-1)}`).toBe('TRY 1');
    const floor=430-Math.max(42,430*.16),unit=Math.min((floor-14)/7,932/13.5,82);
    const y=(floor-paint.point.y)/unit-AVATAR/2,mode=paint.name.includes('PLANE')?'plane':'square';
    const next=courseInput({level,x:1+paint.progress/100*(level.length-1),y,
      vy:mode==='plane'?-paint.tilt/.06:0,mode,gravity:-1,grounded:y<.001,inputHeld:held});
    if(next!==held) {next?await page.keyboard.down('Space'):await page.keyboard.up('Space');held=next;}
    await page.clock.runFor(50);
  }
  await page.keyboard.up('Space');
  await expect(page.getByRole('heading',{name:'Level Complete!',exact:true})).toBeVisible();
  await expect(page.locator('#attempt')).toHaveText('TRY 1');
});

test('a recording download failure uses an original without freezing gameplay',async({page})=>{
  await page.route('**/music/*.mp3',route=>route.abort());
  await page.addInitScript(()=>{
    window.loopDurations=[];const start=AudioBufferSourceNode.prototype.start;
    AudioBufferSourceNode.prototype.start=function(...args){if(this.loop&&this.buffer)window.loopDurations.push(this.buffer.duration);return start.apply(this,args);};
  });
  await page.goto('/');await page.locator('#sound').click();
  await expect(page.locator('#notice')).toContainText('original soundtrack');
  await expect.poll(()=>page.evaluate(()=>window.loopDurations.at(-1))).toBeCloseTo(25.6,1);
  await page.getByRole('button',{name:'Play Pulseway',exact:true}).click();
  await expect.poll(()=>page.locator('#run-progress').evaluate(e=>e.value)).toBeGreaterThan(0);
});
