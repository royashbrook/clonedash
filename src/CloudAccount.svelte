<script lang="ts">
  import { onMount } from "svelte";
  import { IMPORT, checkBackup, decodeBackup, encodeBackup, sameData, summary, type Backup } from "./backup.ts";
  import { SAVE, readSave } from "./library.ts";
  import { SKINS, readSkins } from "./skin.ts";
  import { LOOPS } from "./loop.ts";
  import { SONG_KEY } from "./arrangement.ts";
  let {open = $bindable(false), trails, replace}: {open:boolean; trails:number; replace:(save:Backup)=>void} = $props();
  let dialog:HTMLDialogElement;
  const active = "clonedash.cloud.connected";
  let connected = $state(false), enabled = $state(false), busy = $state(false), notice = $state("");
  let other = $state<{sha:string; save:Backup}|null>(null);
  let binding = "", base:string|null = null, last = "", ready = false, initialized = false, alive = false, asked = false;
  function parts() {
    const marker = localStorage.getItem(IMPORT);
    if (marker && JSON.parse(marker).state === "pending") throw Error("Finish loading the device save first.");
    const raw = [SAVE,SKINS,LOOPS,SONG_KEY].map(k => localStorage.getItem(k));
    return raw;
  }
  function device(raw = parts()) {
    const data = checkBackup({v:1,game:raw[0]===null?readSave(null,trails):JSON.parse(raw[0]),
      skins:raw[1]===null?readSkins(null):JSON.parse(raw[1]),
      ...(raw[2]===null?{}:{loops:JSON.parse(raw[2])}), ...(raw[3]===null?{}:{songs:JSON.parse(raw[3])})},trails);
    return {data, stamp:JSON.stringify(raw)};
  }
  async function api(path:string, options?:RequestInit) {
    const r = await fetch("/api/backup/"+path,{cache:"no-store",...options});
    if (!r.headers.get("content-type")?.includes("application/json")) throw Error("Account pilot is not enabled here.");
    const result = await r.json();
    if (!r.ok) {
      if (r.status === 401) {connected=false; ready=false; localStorage.removeItem(active);}
      throw Error(result.error ?? "Account pilot is not available.");
    }
    return result;
  }
  function remember(sha:string) {localStorage.setItem(binding,sha); base=sha;}
  async function inspect() {
    ready=false; other=null;
    const {file} = await api("file");
    const local = device();
    if (file) {
      const remote = await decodeBackup(file.code,trails);
      if (sameData(local.data,remote)) {remember(file.sha);last=local.stamp;}
      else if (base !== file.sha) {other={sha:file.sha,save:remote};notice="Another backup exists. Nothing has been overwritten.";return;}
      else last="";
    } else if (base) {throw Error("Your backup file was removed. Automatic backup is paused.");}
    ready=true; notice="Automatic backup is on.";
  }
  async function submit() {
    if (!ready || !connected || !alive || !navigator.onLine) return;
    const raw=parts();
    if(JSON.stringify(raw)===last) return;
    const local=device(raw);
    const {sha} = await api("file",{method:"PUT",headers:{"x-backup-revision":base??"new"},
      body:await encodeBackup(local.data,trails)});
    remember(sha);last=local.stamp;notice="Backed up to GitHub.";
  }
  async function run(fn:()=>Promise<void>) {
    if (busy) return; busy=true;
    try {await fn();} catch(e) {ready=false;notice=e instanceof Error?e.message:"Backup paused.";}
    finally {busy=false;}
  }
  async function start() {
    await run(async()=>{
      const s=await api("status");enabled=s.enabled;connected=s.connected;
      if (!connected) {ready=false;other=null;localStorage.removeItem(active);notice="";return;}
      localStorage.setItem(active,"1"); binding="clonedash.cloud.rev."+s.binding;
      base=localStorage.getItem(binding);await inspect();await submit();
    });
  }
  async function logout() {await run(async()=>{
    await api("logout",{method:"POST"});ready=false;connected=false;other=null;
    localStorage.removeItem(active);notice="Signed out. Both saves are unchanged.";
  });}
  onMount(()=>{
    alive=true;initialized=true;
    if (location.hash==="#backup-account") {
      open=true; history.replaceState(null,"",location.pathname+location.search);
    } else {
      try {if(localStorage.getItem(active)) void start();} catch { /* guest without storage */ }
    }
    const timer=setInterval(()=>{if(ready&&!busy&&connected)void run(submit);},30000);
    const changed=()=>{if(ready&&!busy&&connected)void run(submit);};
    const online=()=>{if(connected&&!busy)void start();};
    document.addEventListener("visibilitychange",changed);
    window.addEventListener("online",online);
    return ()=>{alive=false;clearInterval(timer);document.removeEventListener("visibilitychange",changed);window.removeEventListener("online",online);};
  });
  $effect(()=>{if(open && !asked && initialized){asked=true;dialog.showModal();void start();}
    else if(!open){asked=false;dialog?.close();}});
</script>
<dialog bind:this={dialog} aria-label="Account" onclose={()=>open=false}>
  <h2>Account</h2>
  <p>{connected ? "Signed in with GitHub. Your progress and saved creations use one private backup file." :
    "Optional adult pilot. Sign in and approve GitHub access. Cube Dash creates a private repository for your saves and backs up automatically. Guest play stays on this device."}</p>
  <p role="status">{notice}</p>
  {#if connected}
    {#if other}<p>GitHub: {summary(other.save).played} trails played, {summary(other.save).levels} levels, {summary(other.save).skins} skins, {summary(other.save).loops} loops, {other.save.songs?.entries.length??0} songs. Restore replaces this device. Export first in Move your save if you want to keep both.</p>
      <button disabled={busy} onclick={()=>{if(other && confirm("Replace this device with the GitHub backup?"))replace(other.save);}}>RESTORE ON THIS DEVICE</button>
    {/if}
    <button disabled={busy} onclick={start}>CHECK BACKUP</button>
    <button disabled={busy} onclick={logout}>SIGN OUT</button>
  {:else if enabled}
    <form action="/api/backup/login" method="post"><button type="submit">SIGN IN WITH GITHUB</button></form>
  {/if}
  <button onclick={()=>open=false}>CLOSE</button>
</dialog>
<style>
  dialog{width:min(90vw,28rem);max-height:85dvh;overflow:auto;background:#101e2e;color:white;border:1px solid #435468;border-radius:1rem;padding:1.25rem}
  dialog::backdrop{background:#060d18cc}button,form{margin-top:.5rem}button{min-height:44px}
</style>
