import {test,expect} from 'bun:test';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,existsSync,rmSync,readdirSync,realpathSync} from 'node:fs';
import {join,dirname} from 'node:path';
import {tmpdir} from 'node:os';
import {prepareNativeEngineBuild} from '../bin/native-engine-build.ts';
const pin='fe971ebb8e14724d2a98d4df6b34c065caf11132';
function fixture(){
 const temp=mkdtempSync(join(tmpdir(),'pjm-native-manifest-')),root=join(temp,'sdk'),upstream=join(temp,'app-cache');mkdirSync(upstream);
 const file=(name:string,text:string)=>{const path=join(root,'core-ffi',name);mkdirSync(dirname(path),{recursive:true});writeFileSync(path,text);};
 file('src/lib.rs','pub fn fixture() {}');file('include/mini_core.h','// fixture');file('Cargo.lock','# fixture');file('build.rs','fn main() {}');
 const manifest='[package]\nname="fixture"\nversion="0.1.0"\n[dependencies]\n'+[['pocket-mod','engine/crates/pocket-mod'],['pocket-ui-surface','engine/crates/pocket-ui-surface'],['pocketjs-core','engine/core']].map(([name,path])=>name+' = { path = "../examples/hello/.pjm/pocketjs/'+path+'" }').join('\n');file('Cargo.toml',manifest);
 return {temp,root,upstream,manifest};
}
test('native build manifest follows the verified app checkout and snapshots SDK edits without an example cache',async()=>{
 const f=fixture();
 try {
  const run=async(args:string[])=>args.includes('rev-parse')?pin:'';
  const first=await prepareNativeEngineBuild(f.root,run,f.upstream);
  expect(readFileSync(first.manifest,'utf8')).not.toContain('../examples/hello');
  expect(readFileSync(first.manifest,'utf8')).toContain(join(f.upstream,'engine/core'));
  expect(first.env.PJM_UPSTREAM_ROOT).toBe(realpathSync(f.upstream));
  expect(readFileSync(join(f.root,'core-ffi/Cargo.toml'),'utf8')).toBe(f.manifest);
  expect(existsSync(join(f.root,'examples'))).toBe(false);
  const again=await prepareNativeEngineBuild(f.root,run,f.upstream);expect(again.manifest).toBe(first.manifest);
  writeFileSync(join(f.root,'core-ffi/src/lib.rs'),'pub fn changed() {}');
  const changed=await prepareNativeEngineBuild(f.root,run,f.upstream);expect(changed.manifest).not.toBe(first.manifest);
  expect(readFileSync(join(dirname(first.manifest),'src/lib.rs'),'utf8')).toBe('pub fn fixture() {}');
  expect(readFileSync(join(dirname(changed.manifest),'src/lib.rs'),'utf8')).toBe('pub fn changed() {}');
  expect(readdirSync(join(f.root,'.pjm/native-core')).some(name=>name.startsWith('.prepare-'))).toBe(false);
  writeFileSync(join(dirname(changed.manifest),'src/lib.rs'),'corrupted cache');
  await expect(prepareNativeEngineBuild(f.root,run,f.upstream)).rejects.toThrow('Native build cache is inconsistent');
  expect(readFileSync(join(f.root,'core-ffi/src/lib.rs'),'utf8')).toBe('pub fn changed() {}');
 } finally {rmSync(f.temp,{recursive:true,force:true});}
});
test('native builds reject a wrong pin or modified tracked engine before preparing source snapshots',async()=>{
 const f=fixture();
 try {
  await expect(prepareNativeEngineBuild(f.root,async()=> 'wrong-pin',f.upstream)).rejects.toThrow('Unexpected PocketJS revision');
  await expect(prepareNativeEngineBuild(f.root,async(args)=>{if(args.includes('diff'))throw Error('tracked source changed');return pin;},f.upstream)).rejects.toThrow('tracked source changed');
  expect(existsSync(join(f.root,'.pjm'))).toBe(false);
 } finally {rmSync(f.temp,{recursive:true,force:true});}
});
