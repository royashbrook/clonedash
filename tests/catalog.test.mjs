import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { readCatalog } from "../scripts/content.mjs";
import { baseFor, onlyAdditions } from "../scripts/content-lane.mjs";
import { encodeSkin } from "../src/skin.ts";
import { encodeLevel } from "../src/transfer.ts";
import { encodeLoop, blankLoop } from "../src/loop.ts";

test("one original file publishes each kind; reject an invalid item, gap or symlink", async () => {
  const root = await mkdtemp(join(tmpdir(), "dash-content-"));
  const put = async (f, data) => { const path=join(root,"content",f); await mkdir(dirname(path),{recursive:true}); await writeFile(path,data); };
  try {
    const skin={name:"Star",width:4,height:4,palette:["#ff0000"],pixels:"1"+"0".repeat(15)};
    const loop=blankLoop(); loop.name="Beat"; loop.notes[0]=[0];
    const song={name:"Mix",bpm:120,sections:[{loop,repeats:2}]};
    await put("README.md","Instructions");
    assert.deepEqual(await readCatalog(root),{levels:[],skins:[],loops:[],songs:[]});
    const level={name:"First run",length:40,song:9,objects:[{type:"spike",x:10,y:0,rotation:0,flipX:false,flipY:false}]};
    const trail=await encodeLevel(level);
    await put("levels/challenger/0031-first-run.cdl",trail);
    await put("skins/star.cds",await encodeSkin(skin));
    await put("music/loops/beat.cdm",await encodeLoop(loop));
    await put("music/songs/mix.json",JSON.stringify(song));
    const catalog=await readCatalog(root);
    assert.deepEqual(catalog.levels,[level]);
    assert.deepEqual(catalog.skins,[skin]);assert.deepEqual(catalog.loops,[loop]);assert.deepEqual(catalog.songs,[song]);
    await put("levels/challenger/0033-gap.cdl",trail);
    await assert.rejects(readCatalog(root), /consecutive/);
    await rm(join(root,"content/levels/challenger/0033-gap.cdl"));
    await put("music/songs/mix.json",'{"name":"broken"}');
    await assert.rejects(readCatalog(root), /mix.json/);
    await put("music/songs/mix.json",JSON.stringify(song));
    await symlink("star.cds",join(root,"content/skins/link.cds"));
    await assert.rejects(readCatalog(root), /Invalid content file/);
  } finally { await rm(root,{recursive:true,force:true}); }
});

test("only new regular content files get short checks; deploy starts at live", async () => {
  const row=(path,header=":000000 100644 0000000 123abcd A")=>header+"\0"+path+"\0";
  const add=row("content/skins/star.cds");
  assert.equal(onlyAdditions(add+row("content/music/loops/beat.cdm")),true);
  for(const bad of ["",add+row("src/engine.ts"),row("content/skins/star.cds",":100644 100644 1234567 123abcd M"),row("content/skins/star.cds",":000000 120000 0000000 123abcd A"),row("content/music/songs/a.js")]) assert.equal(onlyAdditions(bad),false);
  assert.equal(await baseFor("workflow_run",{workflow_run:{head_sha:"checked"}},"checked",()=> "live"),"live");
  assert.equal(await baseFor("workflow_run",{workflow_run:{head_sha:"older"}},"newer",()=> "live"),null);
  assert.equal(await baseFor("workflow_dispatch",{},"checked",()=> "live"),null);
});
