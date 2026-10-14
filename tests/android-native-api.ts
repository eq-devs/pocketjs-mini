import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir,homedir} from 'node:os';
import {resolve,join} from 'node:path';
import {auditAndroidImports} from '../bin/android-elf.ts';

const root=resolve(import.meta.dir,'..');
const sdk=process.env.ANDROID_SDK_ROOT??process.env.ANDROID_HOME??join(homedir(),'Library/Android/sdk');
const tools=join(sdk,'ndk/28.2.13676358/toolchains/llvm/prebuilt',process.platform==='darwin'?'darwin-x86_64':'linux-x86_64');
const evidence=resolve(process.env.PJM_NATIVE_API_EVIDENCE??join(root,'build/validation/android-native-api-'+Date.now()));
mkdirSync(evidence,{recursive:true});
const temporary=mkdtempSync(join(tmpdir(),'pjm-native-api-'));
let log='';
async function run(args:string[]){
  const child=Bun.spawn(args,{stdout:'pipe',stderr:'pipe'});
  const timeout=setTimeout(()=>child.kill('SIGTERM'),120000);
  try{const [status,out,err]=await Promise.all([child.exited,new Response(child.stdout).text(),new Response(child.stderr).text()]);log+=args.join(' ')+'\n'+out+err;assert.equal(status,0,err);}finally{clearTimeout(timeout);}
}
try{
  const library=join(evidence,'libinstalled.so');
  const flags=['-Wall','-Wextra','-Werror','-O2','-fPIC','-shared','-Wl,--gc-sections','-Wl,--exclude-libs,ALL','-Wl,--no-undefined','-Wl,-z,max-page-size=16384','-I',join(root,'core-ffi/include')];
  const bridges=['package_bridge.c','pool_bridge.c','store_bridge.c'].map(name=>join(root,'host/android',name));
  const archive=join(root,'core-ffi/target/aarch64-linux-android/release/libmini_core_ffi.a');
  const libraries=['-lEGL','-lGLESv2','-ldl','-lm','-llog'];
  await run([join(tools,'bin/aarch64-linux-android23-clang'),...flags,...bridges,archive,...libraries,'-o',library]);
  const installed=auditAndroidImports(library,tools,23);
  const developmentLibrary=join(evidence,'libdevelopment.so');
  const upstream=resolve(root,'examples/hello/.pjm/pocketjs');
  const includes=['hosts/shared','hosts/blackberry-classic','engine/quickjs-c','engine/ui-cabi/include','contracts/generated'].flatMap(path=>['-I',join(upstream,path)]);
  await run([join(tools,'bin/aarch64-linux-android23-clang'),...flags,...includes,'-I',join(root,'host/android'),join(root,'host/android/runtime.c'),...bridges,archive,...libraries,'-o',developmentLibrary]);
  const development=auditAndroidImports(developmentLibrary,tools,23);
  const probe=join(temporary,'probe.c'),probeLibrary=join(temporary,'probe.so');
  writeFileSync(probe,'#include <android/sharedmem.h>\nint probe(void){return ASharedMemory_create("probe",4096);}\n');
  await run([join(tools,'bin/aarch64-linux-android26-clang'),'-shared','-fPIC',probe,'-landroid','-o',probeLibrary]);
  assert.throws(()=>auditAndroidImports(probeLibrary,tools,23),/ASharedMemory_create/);
  const api26=auditAndroidImports(probeLibrary,tools,26);
  assert.ok(api26.requiredImports.some(name=>name.startsWith('ASharedMemory_create')));
  writeFileSync(join(evidence,'result.json'),JSON.stringify({installed,development,negativeControl:{api26Import:'ASharedMemory_create',rejectedAt23:true,acceptedAt26:true},nativeArchive:archive,nativeArchiveRebuilt:false,minimumRuntimeExecuted:false,physicalAcceptance:false},null,2)+'\n');
  console.log('Fresh installed/development JNI links pass API 23 strong-import checks; API 26 negative control rejected at API 23 and accepted at API 26.');
}finally{rmSync(temporary,{recursive:true,force:true});writeFileSync(join(evidence,'run.log'),log);}
