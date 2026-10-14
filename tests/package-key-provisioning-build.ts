import assert from 'node:assert/strict';
import {existsSync,mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {writeInstalledProject} from '../bin/installed-project.ts';
import {writeInstalledAndroidProject} from '../bin/installed-android-project.ts';

// Build the actual exported resources. This is packaging evidence, not device
// execution or a rendered host-upgrade acceptance test.
const platform=process.argv[2],evidence=resolve(process.argv[3]??'');
assert.ok(platform==='ios'||platform==='android');
assert.ok(process.argv[3]&&!existsSync(evidence),'Choose a new evidence directory');
mkdirSync(evidence,{recursive:true});
const root=resolve(import.meta.dir,'..');
async function run(args:string[],log:string){
  const child=Bun.spawn(args,{stdout:'pipe',stderr:'pipe',env:{...process.env,PJM_PACKAGE_REAL:'',PJM_PACKAGE_TARGET:platform}});
  const timer=setTimeout(()=>child.kill('SIGTERM'),300000);
  try{
    const [status,out,err]=await Promise.all([child.exited,new Response(child.stdout).arrayBuffer(),new Response(child.stderr).arrayBuffer()]);
    writeFileSync(join(evidence,log),Buffer.concat([Buffer.from(out),Buffer.from(err)]));
    assert.equal(status,0,`See ${join(evidence,log)}`);return Buffer.from(out);
  }finally{clearTimeout(timer);}
}
await run([process.execPath,join(root,'tests/package-load-fixtures.ts'),join(evidence,'cases.json')],'fixture.log');
const item=JSON.parse(readFileSync(join(evidence,'cases.json'),'utf8')).find((value:any)=>value.rotation);
assert.ok(item?.rotation);
for(const [name,value] of [['main.pocket',Buffer.from(item.rotation.payload,'base64')],['manifest.json',JSON.stringify(item.rotation.manifest)],['publisher.key',Buffer.from(item.rotation.key,'base64')],['publisher.previous.key',Buffer.from(item.key,'base64')]] as const)writeFileSync(join(evidence,name),value);
const directory=join(evidence,'host'),options={directory,payload:join(evidence,'main.pocket'),envelope:join(evidence,'manifest.json'),publicKey:join(evidence,'publisher.key'),previousPublicKey:join(evidence,'publisher.previous.key')};
let artifact:string;
if(platform==='ios'){
  writeInstalledProject({...options,library:join(root,'core-ffi/target/aarch64-apple-ios-sim/release/libmini_core_ffi.a')});
  await run(['xcodebuild','-quiet','-project',join(directory,'Mini.xcodeproj'),'-scheme','Mini','-configuration','Release','-sdk','iphonesimulator','-destination','generic/platform=iOS Simulator','-derivedDataPath',join(evidence,'DerivedData'),'ARCHS='+process.arch.replace('x64','x86_64'),'ONLY_ACTIVE_ARCH=YES','CODE_SIGNING_ALLOWED=NO','build'],'build.log');
  artifact=join(evidence,'DerivedData/Build/Products/Release-iphonesimulator/Mini.app');
  for(const name of ['publisher.key','publisher.previous.key'])assert.deepEqual(readFileSync(join(artifact,name)),readFileSync(join(evidence,name)));
}else{
  writeInstalledAndroidProject({...options,library:join(root,'core-ffi/target/aarch64-linux-android/release/libmini_core_ffi.so')});
  await run(['bash',join(directory,'build-apk.sh')],'build.log');
  artifact=join(directory,'build/Mini-unsigned.apk');
  for(const name of ['publisher.key','publisher.previous.key'])assert.deepEqual(await run(['unzip','-p',artifact,'assets/'+name],name+'.extracted'),readFileSync(join(evidence,name)));
}
writeFileSync(join(evidence,'result.json'),JSON.stringify({platform,artifact,buildPassed:true,currentAndPreviousKeyBytesVerified:true,renderedHandoff:false,physicalDeviceAcceptance:false},null,2)+'\n');
console.log(`${platform} exported publisher-key resources built and verified`);
