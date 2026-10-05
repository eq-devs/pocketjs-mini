import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync, rmSync, symlinkSync, readlinkSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { installSdk } from "../bin/sdk.ts";
import {runInNewContext} from 'node:vm';
test('installed SDK bundles and runs mailbox protocol without host-only globals',async()=>{
 const root=mkdtempSync('/private/tmp/pjm-sdk-bundle-');try{
  installSdk(root);const entry=join(root,'entry.ts');
  writeFileSync(entry,"import {connectMiniApp} from '@pocketjs/mini'; globalThis.__app=connectMiniApp();");
  const bundle=await Bun.build({entrypoints:[entry],target:'browser',format:'iife'});
  assert.equal(bundle.success,true,String(bundle.logs));assert.equal(bundle.outputs.length,1);
  const sent:string[]=[];let reply='';const context:any={frame(){},ui:{svcOpen:()=>true,svcSend:(line:string)=>sent.push(line),svcPoll:()=>{const value=reply;reply='';return value;}}};
  runInNewContext(await bundle.outputs[0].text(),context);
  for(const name of ['TextDecoder','TextEncoder','Bun','process'])assert.equal(runInNewContext('typeof '+name,context),'undefined');
  const app=context.__app,read=app.clipboard.read(),id=JSON.parse(sent[0]).id;
  reply=JSON.stringify({v:1,id,ok:true,data:{text:'bundled 😀'}});context.frame();assert.equal(await read.promise,'bundled 😀');
  const pending=app.request('fixture.v1');const cancelled=assert.rejects(pending.promise,{code:'CANCELLED'});
  reply='{"v":1,"id":2,"id":3,"ok":true}';assert.throws(()=>context.frame(),{code:'PROTOCOL'});pending.cancel();await cancelled;app.dispose();
 }finally{rmSync(root,{recursive:true,force:true});}
});
test("generated SDK preserves user config and refuses external dependency/file paths",()=>{
  const root=mkdtempSync("/private/tmp/pjm-sdk-install-"),outside=mkdtempSync("/private/tmp/pjm-sdk-outside-");
  try{
    writeFileSync(join(root,"tsconfig.json"),'{"user":true}');installSdk(root);
    const link=join(root,"node_modules/@pocketjs/mini"),sdk=join(root,".pjm/mini-sdk");
    assert.equal(resolve(dirname(link),readlinkSync(link)),sdk);
    assert.equal(readFileSync(join(root,"tsconfig.json"),"utf8"),'{"user":true}');
    assert.ok(readFileSync(join(sdk,"index.ts"),"utf8").includes("connectMiniApp"));installSdk(root);
    assert.ok(readFileSync(join(sdk,"http.ts"),"utf8").includes("checkedHttpResponse"));
    rmSync(join(sdk,"runtime.ts"));writeFileSync(join(outside,"sentinel"),"keep");symlinkSync(join(outside,"sentinel"),join(sdk,"runtime.ts"));
    assert.throws(()=>installSdk(root),/Invalid generated SDK file/);assert.equal(readFileSync(join(outside,"sentinel"),"utf8"),"keep");
    rmSync(link);mkdirSync(link);writeFileSync(join(link,"user"),"keep");
    assert.throws(()=>installSdk(root),/already exists/);assert.equal(readFileSync(join(link,"user"),"utf8"),"keep");
  }finally{rmSync(root,{recursive:true,force:true});rmSync(outside,{recursive:true,force:true});}
});
