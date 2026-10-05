import {test} from "node:test";
import assert from "node:assert/strict";
import {mkdtempSync,rmSync,writeFileSync,symlinkSync,readFileSync,mkdirSync} from "node:fs";
import {join} from "node:path";
import {generateKeyPairSync} from "node:crypto";
import {PackageStore} from "../container/store.ts";
import {AppStorage,VALUE_BYTES,STORAGE_KEYS} from "../container/storage.ts";
test("storage survives restart, isolates apps and treats traversal/prototype keys as data",()=>{
  const root=mkdtempSync("/private/tmp/pjm-storage-");
  try {
    const store=new PackageStore(root,generateKeyPairSync("ed25519").publicKey,{abi:7,target:"pjm-android"});
    const first=new AppStorage(store,"com.example.first"),second=new AppStorage(store,"com.example.second");
    first.set("../outside",{enabled:true});first.set("__proto__","plain");first.set("constructor",42);
    assert.equal(second.get("../outside"),null);second.set("__proto__","second");
    assert.deepEqual(new AppStorage(store,"com.example.first").get("../outside"),{enabled:true});
    assert.equal(first.get("__proto__"),"plain");assert.equal(first.get("constructor"),42);assert.equal(second.get("__proto__"),"second");
    first.remove("constructor");assert.equal(first.get("constructor"),null);
    assert.throws(()=>first.set("large","x".repeat(VALUE_BYTES)),/quota/);
    assert.throws(()=>first.set("invalid",undefined),/JSON/);
    assert.throws(()=>first.set("",1),/key/);
    assert.throws(()=>first.set("\ud800",1),/JSON/);assert.throws(()=>first.set("invalid-unicode","\ud800"),/JSON/);
    for(let i=0;i<STORAGE_KEYS-2;i++)first.set(`key-${i}`,i);
    assert.throws(()=>first.set("one-too-many",1),/quota/);
    assert.equal(first.get("__proto__"),"plain");
  }finally{rmSync(root,{recursive:true,force:true});}
});
test("storage refuses corrupt, symlinked and concurrently locked files without changing outside data",()=>{
  const root=mkdtempSync("/private/tmp/pjm-storage-"),outside=join(root,"outside");
  try {
    const store=new PackageStore(root,generateKeyPairSync("ed25519").publicKey,{abi:7,target:"pjm-ios"});
    const storage=new AppStorage(store,"com.example.app"),directory=store.dataRoot("com.example.app"),file=join(directory,"storage.json");
    for(const malformed of ['{"key":1,"key":2}','{"key":1,"\\u006bey":2}','{"key":"\\ud800"}','{"key":1e999}']){writeFileSync(file,malformed);assert.throws(()=>storage.set("key",3));assert.equal(readFileSync(file,"utf8"),malformed);}
    const malformedBytes=Buffer.from([123,34,120,34,58,34,255,34,125]);writeFileSync(file,malformedBytes);assert.throws(()=>storage.get("x"));assert.deepEqual(readFileSync(file),malformedBytes);
    writeFileSync(file,"invalid");assert.throws(()=>storage.get("key"));rmSync(file);
    writeFileSync(outside,"keep");symlinkSync(outside,file);assert.throws(()=>storage.set("key",1),/Invalid storage/);assert.equal(readFileSync(outside,"utf8"),"keep");rmSync(file);
    mkdirSync(join(directory,".storage-lock"));assert.throws(()=>storage.set("key",1),/busy/);
    rmSync(directory,{recursive:true});const redirected=join(root,"redirected");mkdirSync(redirected);symlinkSync(redirected,directory);
    assert.throws(()=>storage.set("key",1),/real directory/);
  }finally{rmSync(root,{recursive:true,force:true});}
});
