import test from 'node:test';
import assert from 'node:assert/strict';
import { vault, boundedText } from '../backup/github.mjs';
import worker from '../backup/worker.mjs';
import { encodeBackup, decodeBackup } from '../src/backup.ts';
import { LEVELS } from '../src/levels.ts';
import { readSave } from '../src/library.ts';
import { readSkins } from '../src/skin.ts';

const repo = {id:2,private:true,owner:{type:'User',id:1},default_branch:'main',full_name:'test/save'};
const revision = 'a'.repeat(40);
function github(r=repo, selection='selected') {
  let entry=null, calls=[];
  async function send(url, opts) {
    assert.equal(opts.redirect,'error'); const {pathname:p}=new URL(url);
    if (p==='/user/installations') return Response.json({total_count:1,installations:[{
      id:8,account:{id:1},repository_selection:selection,permissions:{contents:'write'}}]});
    if (p==='/user/installations/8/repositories') return Response.json({total_count:1,repositories:[r]});
    assert.equal(p,'/repos/test/save/contents/cube-dash.cdb');
    if (!opts.method) return entry?Response.json(entry):new Response(null,{status:404});
    const body=JSON.parse(opts.body);
    if (body.sha!==entry?.sha) return new Response(null,{status:409});
    calls.push(body);entry={path:'cube-dash.cdb',type:'file',sha:revision,size:atob(body.content).length,
      content:body.content,encoding:'base64'};
    return Response.json({content:{sha:revision}});
  }
  return {store:vault({user:1,repo:2},'fixture',send),calls};
}
const save={game:readSave(null,LEVELS.length),skins:readSkins(null)};
save.game.best={0:92};
test('one file, create versus update, stale device refused, validated restore',async()=>{
  const {store,calls}=github(), code=await encodeBackup(save,LEVELS.length);
  assert.equal(await store.read(),null);
  assert.equal(await store.write(code,null),revision);
  assert.deepEqual(await decodeBackup((await store.read()).code,LEVELS.length),save);
  await assert.rejects(store.write(code,null),{status:409});
  await assert.rejects(store.write(code,'b'.repeat(40)),{status:409});
  await store.write(code,revision);assert.equal(calls.length,2);assert.equal(calls[1].sha,revision);
});
test('public, transferred, substituted or all-repos installation never reaches the file',async()=>{
  const code=await encodeBackup(save,LEVELS.length);
  for(const {store,calls} of [github({...repo,private:false}),github({...repo,id:3}),
      github({...repo,owner:{id:4,type:'User'}}),github(repo,'all')]){
    await assert.rejects(store.read(),{status:403});
    await assert.rejects(store.write(code,null),{status:403});assert.deepEqual(calls,[]);
  }
});
test('non-game bytes, share links and oversized streams refused',async()=>{
  const {store,calls}=github();
  for(const code of ['not a save','cdb1.0AAAA','https://example.com/#save=stuff'])
    await assert.rejects(store.write(code,null));
  assert.deepEqual(calls,[]);
  await assert.rejects(boundedText(new Response('abcdef'),5),{status:413});
});
test('account endpoints stay off unconfigured, cross-origin writes and mismatched OAuth state fail closed',async()=>{
  const origin='https://example.test', env={PILOT_ORIGIN:origin,PILOT_CLIENT_ID:'fixture',
    PILOT_CLIENT_SECRET:'fixture',PILOT_USER_ID:'1',PILOT_APP_SLUG:'test-backup',SESSIONS:{}};
  const req=(p,init)=>new Request(origin+'/api/backup/'+p,init);
  assert.equal((await worker.fetch(req('status'),{})).status,503);
  assert.equal((await worker.fetch(req('login',{method:'POST'}),env)).status,403);
  assert.equal((await worker.fetch(req('callback?code=no&state=wrong'),env)).status,400);
  assert.equal((await worker.fetch(req('file'),env)).status,401);
  const login=await worker.fetch(req('login',{method:'POST',headers:{Origin:origin}}),env);
  assert.equal(login.status,303);const url=new URL(login.headers.get('location'));
  assert.equal(url.origin,'https://github.com');assert.equal(url.searchParams.get('code_challenge_method'),'S256');
  assert.match(login.headers.get('set-cookie'),/Secure; HttpOnly; SameSite=Lax/);
});
