import { vault, BackupError, boundedText } from './github.mjs';
import { MAX_SAVE_TEXT } from '../src/transfer.ts';

const prefix = '/api/backup/', session = '__Host-cd-session', flow = '__Host-cd-login';
const age = 30 * 86400;
const opaque = () => crypto.randomUUID().replaceAll('-', '') + crypto.randomUUID().replaceAll('-', '');
const hash = async value => btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.digest(
  'SHA-256', new TextEncoder().encode(value))))).replaceAll('+','-').replaceAll('/','_').replace(/=+$/, '');
const cookie = (name, value, seconds) => name + '=' + value + '; Secure; HttpOnly; SameSite=Lax; Path=/; Max-Age=' + seconds;
function getCookie(req, name) {
  return (req.headers.get('cookie') || '').split('; ').find(v => v.startsWith(name + '='))?.slice(name.length + 1);
}
function reply(data, status = 200) {
  return Response.json(data, {status, headers:{'Cache-Control':'private, no-store', 'Referrer-Policy':'no-referrer'}});
}
function redirect(url, ...cookies) {
  const headers = new Headers({Location:url, 'Cache-Control':'private, no-store','Referrer-Policy':'no-referrer'});
  for (const c of cookies) headers.append('Set-Cookie', c);
  return new Response(null, {status:303, headers});
}
async function exchange(env, fields) {
  const res = await fetch('https://github.com/login/oauth/access_token', {
    method:'POST', redirect:'error', headers:{Accept:'application/json'},
    body:new URLSearchParams({client_id:env.PILOT_CLIENT_ID, client_secret:env.PILOT_CLIENT_SECRET, ...fields}),
  });
  const body = JSON.parse(await boundedText(res, 16384));
  if (!res.ok || !body.access_token || !body.refresh_token || !(body.expires_in > 60))
    throw new BackupError(401, 'Please sign in again.');
  return body;
}
export async function account(req, env) {
  const url = new URL(req.url), path = url.pathname.slice(prefix.length);
  const now = Math.floor(Date.now()/1000);
  if (!env.PILOT_CLIENT_ID || !env.PILOT_CLIENT_SECRET || !env.SESSIONS ||
      !Number(env.PILOT_USER_ID) || !/^[a-z0-9-]+$/.test(env.PILOT_APP_SLUG ?? '') || env.PILOT_ORIGIN !== url.origin)
    return reply({enabled:false}, 503);
  const callback = env.PILOT_ORIGIN + prefix + 'callback';
  if (req.method !== 'GET' && req.headers.get('origin') !== url.origin) return reply({},403);
  const afterGrant = path === 'installed' && req.method === 'GET';
  if ((path === 'login' && req.method === 'POST') || afterGrant) {
    if (afterGrant && (!url.searchParams.get('state') ||
        getCookie(req,flow) !== 'install.' + url.searchParams.get('state')))
      return reply({error:'Approval expired. Return to Account to sign in again.'},400);
    const state = opaque(), verifier = opaque();
    const auth = new URL('https://github.com/login/oauth/authorize');
    auth.search = new URLSearchParams({client_id:env.PILOT_CLIENT_ID, redirect_uri:callback,
      scope:'offline_access',state, code_challenge_method:'S256', code_challenge:await hash(verifier)}).toString();
    return redirect(auth.href, cookie(flow,state+'.'+verifier+(afterGrant?'.granted':''),600));
  }
  if (path === 'callback' && req.method === 'GET') {
    const [state, verifier, stage] = (getCookie(req,flow)||'').split('.');
    if (!/^[a-f0-9]{64}$/.test(state) || !verifier || state !== url.searchParams.get('state') || !url.searchParams.get('code'))
      return reply({error:'Login expired or cancelled. Return to the game and try again.'},400);
    const token = await exchange(env,{code:url.searchParams.get('code'),redirect_uri:callback,code_verifier:verifier});
    const who = await fetch('https://api.github.com/user',{redirect:'error',
      headers:{Authorization:'Bearer '+token.access_token,'User-Agent':'cube-dash-backup'}});
    const user = who.ok && (JSON.parse(await boundedText(who,32768))).id;
    if (user !== Number(env.PILOT_USER_ID))
      throw new BackupError(403,'This account is not in the private pilot.');
    const dest = await vault({user},token.access_token).provision(env.SESSIONS);
    if (!dest) {
      if (stage === 'granted') throw new BackupError(403,'GitHub has not granted private backup access.');
      const next = opaque();
      return redirect('https://github.com/apps/'+env.PILOT_APP_SLUG+'/installations/new?state='+next,
        cookie(flow,'install.'+next,600));
    }
    const id = opaque();
    await env.SESSIONS.prepare('delete from github_sessions where expires <= ?').bind(now).run();
    await env.SESSIONS.prepare('insert into github_sessions values (?, ?, ?, ?, ?, ?)').bind(
      await hash(id),user,token.access_token,token.refresh_token,now+token.expires_in-60,now+age).run();
    return redirect(url.origin+'/#backup-account',cookie(flow,'',0),cookie(session,id,age));
  }
  const id = getCookie(req,session), key = id ? await hash(id) : '';
  if (path === 'logout' && req.method === 'POST') {
    if (key) await env.SESSIONS.prepare('delete from github_sessions where id = ?').bind(key).run();
    const out = reply({connected:false}); out.headers.set('Set-Cookie',cookie(session,'',0)); return out;
  }
  const row = key && await env.SESSIONS.prepare('select s.*, v.repo_id from github_sessions s join backup_vaults v on v.user_id=s.user_id where s.id=? and s.expires>? and s.user_id=?').bind(key,now,Number(env.PILOT_USER_ID)).first();
  if (path === 'status' && req.method === 'GET') return reply({enabled:true,connected:!!row,
    ...(row ? {binding:row.user_id+'.'+row.repo_id} : {})});
  if (!row) return reply({error:'Please sign in.'},401);
  if (path !== 'file' || !['GET','PUT'].includes(req.method)) return reply({},404);
  if (row.renew <= now) {
    const token = await exchange(env,{grant_type:'refresh_token',refresh_token:row.refresh});
    const changed = await env.SESSIONS.prepare('update github_sessions set access=?, refresh=?, renew=? where id=? and refresh=?').bind(
      token.access_token,token.refresh_token,now+token.expires_in-60,key,row.refresh).run();
    if (!changed.meta.changes) return reply({error:'Session changed. Reopen Account.'},409);
    row.access = token.access_token;
  }
  const store = vault({user:row.user_id, repo:row.repo_id},row.access);
  if (req.method === 'GET') return reply({file:await store.read()});
  const base = req.headers.get('x-backup-revision');
  if (!base) return reply({error:'Missing device revision.'},428);
  const code = await boundedText(req, MAX_SAVE_TEXT);
  return reply({sha:await store.write(code,base === 'new' ? null : base)});
}
export default {async fetch(req, env) {
  if (!new URL(req.url).pathname.startsWith(prefix)) return env.ASSETS.fetch(req);
  try { return await account(req,env); }
  catch (error) {
    return reply({error:error instanceof BackupError ? error.message : 'Backup unavailable. Your device save is unchanged.'},
      error instanceof BackupError ? error.status : 502);
  }
}};
