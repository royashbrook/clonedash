import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import worker from '../backup/worker.mjs';
import { encodeBackup } from '../src/backup.ts';
import { readSave } from '../src/library.ts';
import { readSkins } from '../src/skin.ts';
import { LEVELS } from '../src/levels.ts';

// Real callback, SQL schema, cookies and file handler. Only the external GitHub API is simulated.
function setup(t) {
  const db=new DatabaseSync(':memory:');
  db.exec(readFileSync(new URL('../backup/session.sql',import.meta.url),'utf8')); t.after(()=>db.close());
  const s={grant:false,selection:'selected',repo:null,creates:0,posts:[],file:null,loseReply:false,
    user:7,creation:'write'};
  const origin='https://game.test', env={PILOT_USER_ID:'7',PILOT_ORIGIN:origin,PILOT_APP_SLUG:'test-backup',
    PILOT_CLIENT_ID:'test',PILOT_CLIENT_SECRET:'fixture', SESSIONS:{prepare(sql){const q=db.prepare(sql);
      return {bind(...v){return {first:()=>q.get(...v),run:()=>({meta:q.run(...v)})};}};}}};
  t.mock.method(globalThis,'fetch',async (url,options)=>{
    const {pathname}=new URL(url);
    if(pathname==='/login/oauth/access_token') return Response.json({access_token:'fake',refresh_token:'fake-refresh',expires_in:3600});
    if(pathname==='/user') return Response.json({id:s.user});
    if(pathname==='/user/installations') return Response.json({total_count:+s.grant,installations:s.grant?[{
      id:99,account:{id:s.user},repository_selection:s.selection,permissions:{contents:'write',repository_creation:s.creation}}]:[]});
    if(pathname==='/user/installations/99/repositories') return Response.json({
      total_count:+!!s.repo,repositories:s.repo?[s.repo]:[]});
    if(pathname==='/user/repos' && options.method==='POST'){
      const b=JSON.parse(options.body);s.posts.push(b);assert.equal(b.private,true);assert.equal(b.auto_init,true);
      assert.match(b.name,/^cube-dash-saves-[0-9a-f]{8}$/);
      assert.equal(s.repo,null,'a second create request must not reach a provisioned vault');
      s.repo={id:101,owner:{id:7,type:'User'},default_branch:'main',full_name:'player/'+b.name,...b};s.creates++;
      if(s.loseReply) throw Error('connection broke after creation');
      return Response.json(s.repo,{status:201});
    }
    if(s.repo && pathname==='/repos/'+s.repo.full_name+'/contents/cube-dash.cdb'){
      if (options.method==='PUT') {
        const b=JSON.parse(options.body);
        s.file={content:b.content,encoding:'base64',size:atob(b.content).length,type:'file',path:'cube-dash.cdb',sha:'a'.repeat(40)};
        return Response.json({content:{sha:s.file.sha}});
      }
      return s.file?Response.json(s.file):new Response(null,{status:404});
    }
    assert.fail('unexpected request: '+pathname);
  });
  const call=(path,init)=>worker.fetch(new Request(origin+'/api/backup/'+path,init),env);
  const start=()=>call('login',{method:'POST',headers:{Origin:origin}});
  const cookie=(res,key)=>res.headers.getSetCookie().find(v=>v.startsWith(key+'=')).split(';')[0];
  const callback=(login)=>call('callback?code=fake&state='+new URL(login.headers.get('location')).searchParams.get('state'),
    {headers:{cookie:cookie(login,'__Host-cd-login')}});
  return {s,call,start,cookie,callback,origin};
}
test('empty account → GitHub consent → private repo + file → tablet restores the same file',async t=>{
  const {s,call,start,cookie,callback,origin}=setup(t);
  const grant=await callback(await start());const install=new URL(grant.headers.get('location'));
  assert.equal(install.hostname,'github.com');assert.equal(install.pathname,'/apps/test-backup/installations/new');
  assert.equal(s.creates,0);s.grant=true;
  const consentCookie=cookie(grant,'__Host-cd-login');
  assert.equal((await call('installed?state=bad',{headers:{cookie:consentCookie}})).status,400);
  const resume=await call('installed?state='+install.searchParams.get('state'),{headers:{cookie:consentCookie}});
  const phone=await callback(resume);assert.equal(phone.status,303);const a=cookie(phone,'__Host-cd-session');
  const game=readSave(null,LEVELS.length);game.best={0:77};
  const code=await encodeBackup({game,skins:readSkins(null)},LEVELS.length);
  assert.equal((await call('file',{method:'PUT',headers:{cookie:a,origin,'x-backup-revision':'new'},body:code})).status,200);
  const tablet=await callback(await start());const b=cookie(tablet,'__Host-cd-session');assert.notEqual(a,b);
  assert.equal((await (await call('file',{headers:{cookie:b}})).json()).file.code,code);
  assert.equal(s.posts.length,1);assert.equal(s.creates,1);
});
test('lost create response reuses the reserved repo, and a substituted id stops the next login',async t=>{
  const {s,start,callback}=setup(t);s.grant=true;s.loseReply=true;
  assert.equal((await callback(await start())).status,502);
  assert.equal((await callback(await start())).status,303);
  s.repo.id++;assert.equal((await callback(await start())).status,403);assert.equal(s.creates,1);
});
test('unexpected owner, blanket permission, missing creation permission and unrelated selection never create',async t=>{
  const {s,start,callback}=setup(t);s.grant=true;s.user=6;
  assert.equal((await callback(await start())).status,403);s.user=7;s.selection='all';
  assert.equal((await callback(await start())).status,403);s.selection='selected';s.creation='read';
  assert.equal((await callback(await start())).status,403);s.creation='write';
  s.repo={id:10,private:true,name:'cube-dash-saves',owner:{type:'User',id:7},default_branch:'main'};
  assert.equal((await callback(await start())).status,409);assert.equal(s.posts.length,0);
});
