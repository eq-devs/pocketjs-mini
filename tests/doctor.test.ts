import {test,expect} from 'bun:test';
import {mkdirSync,mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {join,dirname,resolve} from 'node:path';
import {tmpdir} from 'node:os';

test('public Android doctor checks the build tools used by run/export and reports partial SDK installs',async()=>{
 const temp=mkdtempSync(join(tmpdir(),'pjm-doctor-')),sdk=join(temp,'sdk'),java=join(temp,'jdk'),bin=join(temp,'bin');
 const file=(path:string,text='fixture')=>{mkdirSync(dirname(path),{recursive:true});writeFileSync(path,text,{mode:0o755});};
 const executable=(path:string,output:string)=>file(path,"#!/bin/sh\nprintf '%s\\n' '"+output+"'\n");
 const ndk=join(sdk,'ndk/28.2.13676358/toolchains/llvm/prebuilt',process.platform==='darwin'?'darwin-x86_64':'linux-x86_64','bin');
 try {
  executable(join(bin,'git'),'git version fixture');executable(join(bin,'rustup'),'rustc fixture');
  executable(join(java,'bin/javac'),'javac 17.0.0');file(join(java,'bin/jar'));file(join(java,'bin/keytool'));
  executable(join(sdk,'platform-tools/adb'),'List of devices attached\nowned-fixture device model:Fixture');
  file(join(sdk,'platforms/android-34/android.jar'));file(join(ndk,'aarch64-linux-android23-clang'));file(join(ndk,'llvm-ar'));
  for(const version of ['35.0.0','36.0.0'])for(const tool of ['aapt2','d8','zipalign','apksigner'])file(join(sdk,'build-tools',version,tool));
  async function doctor(){
   const child=Bun.spawn([resolve(import.meta.dir,'../bin/pjm'),'doctor','--device','android'],{cwd:temp,env:{...process.env,PATH:bin+':'+dirname(process.execPath)+':'+process.env.PATH,ANDROID_HOME:sdk,ANDROID_SDK_ROOT:sdk,JAVA_HOME:java},stdout:'pipe',stderr:'pipe'});
   const [code,out,err]=await Promise.all([child.exited,new Response(child.stdout).text(),new Response(child.stderr).text()]);expect(err).toBe('');return {code,out};
  }
  let result=await doctor();expect(result.code).toBe(Bun.version==='1.3.11'?0:1);
  for(const tool of ['aapt2','d8','zipalign','apksigner'])expect(result.out).toContain('OK Android build-tools 36.0.0 '+tool+':');
  expect(result.out).toContain('OK Android NDK 28.2 llvm-ar:');expect(result.out).toContain('OK JDK keytool:');
  rmSync(join(sdk,'build-tools/36.0.0/d8'));
  result=await doctor();expect(result.code).toBe(1);expect(result.out).toContain('MISSING Android build-tools 36.0.0 d8:');expect(result.out).toContain('Install build-tools;36.0.0');
  // A directory and an older complete SDK must not masquerade as the required tool.
  mkdirSync(join(sdk,'build-tools/36.0.0/d8'));
  result=await doctor();expect(result.out).toContain('MISSING Android build-tools 36.0.0 d8:');
  rmSync(join(sdk,'build-tools/36.0.0'),{recursive:true});rmSync(join(java,'bin/keytool'));rmSync(join(ndk,'llvm-ar'));
  result=await doctor();expect(result.code).toBe(1);
  expect(result.out).not.toContain('OK Android build-tools');expect(result.out).toContain('MISSING JDK keytool:');expect(result.out).toContain('MISSING Android NDK 28.2 llvm-ar:');
 } finally {rmSync(temp,{recursive:true,force:true});}
},30000);
