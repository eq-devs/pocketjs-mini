import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync, rmSync, symlinkSync, readlinkSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { installSdk } from "../bin/sdk.ts";
test("generated SDK preserves user config and refuses external dependency/file paths",()=>{
  const root=mkdtempSync("/private/tmp/pjm-sdk-install-"),outside=mkdtempSync("/private/tmp/pjm-sdk-outside-");
  try{
    writeFileSync(join(root,"tsconfig.json"),'{"user":true}');installSdk(root);
    const link=join(root,"node_modules/@pocketjs/mini"),sdk=join(root,".pjm/mini-sdk");
    assert.equal(resolve(dirname(link),readlinkSync(link)),sdk);
    assert.equal(readFileSync(join(root,"tsconfig.json"),"utf8"),'{"user":true}');
    assert.ok(readFileSync(join(sdk,"index.ts"),"utf8").includes("connectMiniApp"));installSdk(root);
    rmSync(join(sdk,"runtime.ts"));writeFileSync(join(outside,"sentinel"),"keep");symlinkSync(join(outside,"sentinel"),join(sdk,"runtime.ts"));
    assert.throws(()=>installSdk(root),/Invalid generated SDK file/);assert.equal(readFileSync(join(outside,"sentinel"),"utf8"),"keep");
    rmSync(link);mkdirSync(link);writeFileSync(join(link,"user"),"keep");
    assert.throws(()=>installSdk(root),/already exists/);assert.equal(readFileSync(join(link,"user"),"utf8"),"keep");
  }finally{rmSync(root,{recursive:true,force:true});rmSync(outside,{recursive:true,force:true});}
});
