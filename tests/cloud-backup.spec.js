import { test, expect } from './quiet.mjs';
import { readSave } from '../src/library.ts';
import { encodeBackup } from '../src/backup.ts';
import { readSkins } from '../src/skin.ts';
import { LEVELS } from '../src/levels.ts';

test('a signed-in phone checkpoints, a new tablet restores without uploading its empty state', async ({browser,baseURL})=>{
  let file=null, writes=0;
  const phone=await browser.newContext({baseURL,serviceWorkers:'block',viewport:{width:390,height:664}});
  const tablet=await browser.newContext({baseURL,serviceWorkers:'block',viewport:{width:820,height:1180}});
  const data=readSave(null,LEVELS.length);data.best={0:93};
  try {
    for (const ctx of [phone,tablet]) await ctx.route('**/api/backup/**',async route=>{
      const req=route.request();
      if(req.url().endsWith('/status')) return route.fulfill({json:{enabled:true,connected:true,binding:'tester.vault'}});
      if(req.url().endsWith('/logout')) return route.fulfill({json:{connected:false}});
      if(req.method()==='GET') return route.fulfill({json:{file}});
      if(req.headers()['x-backup-revision']!==(file?.sha??'new')) return route.fulfill({status:409,json:{error:'Conflict'}});
      writes++;file={sha:writes.toString(16).padStart(40,'0'),code:req.postData()};return route.fulfill({json:{sha:file.sha}});
    });
    await phone.addInitScript(({game})=>localStorage.setItem('clonedash.v1',JSON.stringify(game)),{game:data});
    const p=await phone.newPage();await p.goto('/#backup-account');
    await expect(p.getByRole('status').filter({hasText:'Backed up to GitHub.'})).toBeVisible();
    expect(writes).toBe(1);
    const expected=await encodeBackup({game:data,skins:readSkins(null)},LEVELS.length);
    // Compare the data, not compression output across browser builds.
    const {decodeBackup}=await import('../src/backup.ts');
    expect(await decodeBackup(file.code,LEVELS.length)).toEqual(await decodeBackup(expected,LEVELS.length));
    // Edit the phone save without pressing any cloud button. A background transition checkpoints it.
    await p.evaluate(()=>{const g=JSON.parse(localStorage.getItem('clonedash.v1'));g.best[0]=97;
      localStorage.setItem('clonedash.v1',JSON.stringify(g));document.dispatchEvent(new Event('visibilitychange'));});
    await expect.poll(()=>writes).toBe(2);
    const t=await tablet.newPage();await t.goto('/#backup-account');
    await expect(t.getByRole('button',{name:'RESTORE ON THIS DEVICE'})).toBeVisible();expect(writes).toBe(2);
    t.once('dialog',dlg=>dlg.accept()); await t.getByRole('button',{name:'RESTORE ON THIS DEVICE'}).click();
    await expect.poll(()=>t.evaluate(()=>JSON.parse(localStorage.getItem('clonedash.v1')??'{}').best?.[0])).toBe(97);
    await p.getByRole('button',{name:'SIGN OUT'}).click();
    await expect(p.getByText('Signed out. Both saves are unchanged.')).toBeVisible();
    await p.evaluate(()=>document.dispatchEvent(new Event('visibilitychange')));
    expect(writes).toBe(2);
  } finally {await tablet.close();await phone.close();}
});
