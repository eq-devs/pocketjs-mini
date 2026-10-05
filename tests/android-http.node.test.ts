import {test} from "node:test";
import assert from "node:assert/strict";
import {mkdtempSync,cpSync,rmSync,writeFileSync,symlinkSync} from "node:fs";
import {join} from "node:path";
import {androidHttpFiles} from "../bin/android-http.ts";
test("Android HTTP runtime is complete, pinned and rejects altered or linked jars",()=>{
  const runtime=androidHttpFiles();assert.equal(runtime.files.size,8);
  const root=mkdtempSync("/private/tmp/pjm-http-runtime-");
  try{
    cpSync(runtime.root,root,{recursive:true});assert.equal(androidHttpFiles(root).files.size,8);
    const name="okhttp-android-5.5.0.jar",file=join(root,name);writeFileSync(file,"changed");assert.throws(()=>androidHttpFiles(root),/checksum mismatch/);
    rmSync(file);symlinkSync(join(runtime.root,name),file);assert.throws(()=>androidHttpFiles(root),/Invalid pinned/);
  }finally{rmSync(root,{recursive:true,force:true});}
});
