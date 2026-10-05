import {test} from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync} from 'node:crypto';
import {mkdtempSync,rmSync,readFileSync,writeFileSync,symlinkSync,mkdirSync,readdirSync,openSync,closeSync,fstatSync,statSync} from 'node:fs';
import {join} from 'node:path';
import {PackageStore} from '../container/store.ts';
import {AppStorage} from '../container/storage.ts';
const key=generateKeyPairSync('ed25519').publicKey,host={abi:7,target:'pjm-android' as const};
test('host permission decisions persist by app identity outside guest storage',()=>{
 const root=mkdtempSync('/private/tmp/pjm-permissions-');try{
  const store=new PackageStore(root,key,host),first='dev.pjm.first',second='dev.pjm.second';
  assert.equal(store.permissionDecision(first,'media'),null);store.setPermissionDecision(first,'media',true);store.setPermissionDecision(first,'location',false);
  new AppStorage(store,first).set('permissions.json',{media:false});
  const restarted=new PackageStore(root,key,host);assert.equal(restarted.permissionDecision(first,'media'),true);assert.equal(restarted.permissionDecision(first,'location'),false);assert.equal(restarted.permissionDecision(second,'media'),null);
  restarted.setPermissionDecision(first,'media',false);assert.equal(store.permissionDecision(first,'media'),false);assert.equal(store.permissionDecision(first,'location'),false);
  assert.throws(()=>store.setPermissionDecision(first,'camera' as any,true));assert.throws(()=>store.setPermissionDecision(first,'media',1 as any));assert.throws(()=>store.permissionDecision('../other','media'));
 }finally{rmSync(root,{recursive:true,force:true});}
});
test('permission replacement keeps an opened prior snapshot and private file mode',()=>{
 const root=mkdtempSync('/private/tmp/pjm-permission-replace-');try{
  const store=new PackageStore(root,key,host),id='dev.pjm.first';store.setPermissionDecision(id,'media',true);
  const path=join(root,id,'permissions.json'),previous=openSync(path,'r');
  try{
   const inode=fstatSync(previous).ino;store.setPermissionDecision(id,'media',false);
   assert.notEqual(statSync(path).ino,inode);assert.equal(statSync(path).mode&0o777,0o600);
   assert.equal(JSON.parse(readFileSync(previous,'utf8')).decisions.media,true);
   assert.equal(new PackageStore(root,key,host).permissionDecision(id,'media'),false);
   assert.equal(readdirSync(join(root,id)).some(name=>name.startsWith('.permissions-')||name==='.lock'),false);
  }finally{closeSync(previous);}
 }finally{rmSync(root,{recursive:true,force:true});}
});
test('corrupt, redirected and locked permission state is preserved on rejection',()=>{
 const root=mkdtempSync('/private/tmp/pjm-permissions-');try{
  const store=new PackageStore(root,key,host),id='dev.pjm.first';store.setPermissionDecision(id,'media',true);const path=join(root,id,'permissions.json');
  for(const contents of ['{"format":1,"decisions":{"media":false,"media":true}}','{"format":1,"decisions":{"media":1}}','{"format":1,"decisions":{"unknown":true}}','\ufeff{"format":1,"decisions":{}}']){
   writeFileSync(path,contents);assert.throws(()=>store.permissionDecision(id,'media'));assert.throws(()=>store.setPermissionDecision(id,'media',false));assert.equal(readFileSync(path,'utf8'),contents);
  }
  rmSync(path);const outside=join(root,'outside');writeFileSync(outside,'unchanged');symlinkSync(outside,path);assert.throws(()=>store.setPermissionDecision(id,'media',true));assert.equal(readFileSync(outside,'utf8'),'unchanged');rmSync(path);
  store.setPermissionDecision(id,'media',true);mkdirSync(join(root,id,'.lock'));const before=readFileSync(path);assert.throws(()=>store.setPermissionDecision(id,'media',false),/busy/);assert.deepEqual(readFileSync(path),before);assert.equal(readdirSync(join(root,id)).some(name=>name.startsWith('.permissions-')),false);
 }finally{rmSync(root,{recursive:true,force:true});}
});
