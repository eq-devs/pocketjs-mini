import { test } from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { mkdtempSync, rmSync, readdirSync, writeFileSync, readFileSync, symlinkSync, mkdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { signPackage, type PackageMetadata } from "../container/package.ts";
import { PackageStore } from "../container/store.ts";
const keys = generateKeyPairSync("ed25519");
const host = { abi: 7, target: "pjm-android" as const };
const metadata: PackageMetadata = { appId: "com.example.app", version: "1.0.0", minHostAbi: 7, entry: "main.pocket", pages: ["/"], permissions: [], domains: [], targets: ["pjm-android"] };
function fixture() {
  const root = mkdtempSync("/private/tmp/pjm-store-");
  return { root, store: new PackageStore(root, keys.publicKey, host), close: () => rmSync(root, { recursive: true, force: true }) };
}
function stage(store: PackageStore, version: string, appId = metadata.appId) {
  const payload = Buffer.from(`${appId}:${version}`);
  const signed = signPackage(payload, { ...metadata, appId, version }, keys.privateKey);
  store.stage(payload, signed); return { payload, signed };
}
test('staging authenticates and installs a private snapshot of caller-owned bytes',()=>{
 const f=fixture();try{
  const payload=Buffer.from('original signed bytes'),expected=Buffer.from(payload),signed=signPackage(payload,metadata,keys.privateKey);
  const candidate={...signed};Object.defineProperty(candidate,'appId',{enumerable:true,get(){payload.fill(0);return metadata.appId;}});
  f.store.stage(payload,candidate);
  assert.deepEqual(f.store.coldStart(metadata.appId).payload,expected);assert.deepEqual(payload,Buffer.alloc(payload.length));
  assert.throws(()=>f.store.stage(new Uint8Array(),signed),/size/);
 }finally{f.close();}
});
test('restaging an authenticated existing slot preserves immutable package files',()=>{
  const f=fixture();try{
    const original=stage(f.store,'1.0.0'),slot=join(f.root,metadata.appId,`${original.signed.version}-${original.signed.sha256}`);
    const files=['main.pocket','manifest.json'].map(name=>({name,inode:statSync(join(slot,name)).ino,bytes:readFileSync(join(slot,name))}));
    const reopened=new PackageStore(f.root,keys.publicKey,host);reopened.stage(original.payload,original.signed);
    for(const file of files){assert.equal(statSync(join(slot,file.name)).ino,file.inode);assert.deepEqual(readFileSync(join(slot,file.name)),file.bytes);}
    assert.deepEqual(readdirSync(slot).sort(),['main.pocket','manifest.json']);
    assert.deepEqual(reopened.coldStart(metadata.appId).payload,original.payload);
  }finally{f.close();}
});
test("updates and rollback activate only on cold start, retaining current and previous", () => {
  const f = fixture();
  try {
    stage(f.store, "1.0.0"); const running = f.store.coldStart(metadata.appId);
    stage(f.store, "2.0.0");
    assert.equal(running.manifest.version, "1.0.0");
    const restarted = new PackageStore(f.root, keys.publicKey, host);
    assert.equal(restarted.coldStart(metadata.appId).manifest.version, "2.0.0");
    stage(restarted, "3.0.0"); restarted.coldStart(metadata.appId);
    assert.equal(readdirSync(join(f.root, metadata.appId)).filter(name => /^\d/.test(name)).length, 2);
    restarted.rollback(metadata.appId);
    assert.equal(restarted.coldStart(metadata.appId).manifest.version, "2.0.0");
    assert.equal(running.payload.toString(), `${metadata.appId}:1.0.0`);
  } finally { f.close(); }
});
test("publisher, payload and on-disk tampering fail without replacing active state", () => {
  const f = fixture();
  try {
    const original = stage(f.store, "1.0.0"); f.store.coldStart(metadata.appId);
    const before = readFileSync(join(f.root, metadata.appId, "state.json"));
    const evil = signPackage(original.payload, metadata, generateKeyPairSync("ed25519").privateKey);
    assert.throws(() => f.store.stage(original.payload, evil), /signature/);
    assert.deepEqual(readFileSync(join(f.root, metadata.appId, "state.json")), before);
    const changedPolicy = signPackage(original.payload, { ...metadata, domains: ["api.example.com"] }, keys.privateKey);
    assert.throws(() => f.store.stage(original.payload, changedPolicy), /different signed metadata/);
    const next = stage(f.store, "2.0.0");
    writeFileSync(join(f.root, metadata.appId, `${next.signed.version}-${next.signed.sha256}`, "main.pocket"), "evil");
    assert.throws(() => f.store.coldStart(metadata.appId), /SHA-256/);
    const state = JSON.parse(readFileSync(join(f.root, metadata.appId, "state.json"), "utf8"));
    assert.equal(state.current, `${original.signed.version}-${original.signed.sha256}`);
    f.store.discardUpdate(metadata.appId);
    assert.equal(f.store.coldStart(metadata.appId).manifest.version, "1.0.0");
  } finally { f.close(); }
});
test("app data is isolated, traversal and symlinked paths fail closed", () => {
  const f = fixture(), outside = mkdtempSync("/private/tmp/pjm-outside-");
  try {
    stage(f.store, "1.0.0", "com.example.other");
    const first = f.store.dataRoot(metadata.appId), second = f.store.dataRoot("com.example.other");
    writeFileSync(join(first, "preferences"), "first"); writeFileSync(join(second, "preferences"), "second");
    assert.equal(readFileSync(join(second, "preferences"), "utf8"), "second");
    assert.throws(() => f.store.dataRoot("../escape"), /appId/);
    symlinkSync(outside, join(f.root, "com.example.symlink"));
    assert.throws(() => f.store.dataRoot("com.example.symlink"), /real directory/);
    symlinkSync(outside, join(f.root, "redirect"));
    assert.throws(() => new PackageStore(join(f.root, "redirect"), keys.publicKey, host), /real directory/);
    assert.deepEqual(readdirSync(outside), []);
    mkdirSync(join(f.root, metadata.appId, ".lock"));
    assert.throws(() => stage(f.store, "2.0.0"), /busy/);
  } finally { f.close(); rmSync(outside, { recursive: true, force: true }); }
});
test("ambiguous persisted selection state fails without rewriting or pruning packages",()=>{
 const f=fixture();try{
  const original=stage(f.store,"1.0.0");f.store.coldStart(metadata.appId);stage(f.store,"2.0.0");
  const path=join(f.root,metadata.appId,"state.json"),state=readFileSync(path,'utf8'),slot=`${original.signed.version}-${original.signed.sha256}`;
  const malformed=[state.replace('{',`{"current":"${slot}",`),state.replace('{',`{"\\u0063urrent":"${slot}",`),'\ufeff'+state,Buffer.from([0xff,0xfe]),state+' trailing'];
  for(const contents of malformed){
   writeFileSync(path,contents);const before=readFileSync(path),entries=readdirSync(join(f.root,metadata.appId)).sort();
   for(const action of [()=>f.store.coldStart(metadata.appId),()=>f.store.rollback(metadata.appId),()=>f.store.discardUpdate(metadata.appId),()=>stage(f.store,'3.0.0')]){
    assert.throws(action);assert.deepEqual(readFileSync(path),before);assert.deepEqual(readdirSync(join(f.root,metadata.appId)).sort(),entries);
   }
  }
 }finally{f.close();}
});
