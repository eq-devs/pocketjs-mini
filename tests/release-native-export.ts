// Opt-in macOS acceptance: build public native exports without installing apps.
import assert from 'node:assert/strict';
import {existsSync,mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {join,resolve} from 'node:path';
const root=resolve(import.meta.dir,'..');
assert.equal(process.platform,'darwin','This checks both Apple and Android exports');
assert.ok(process.env.PJM_RELEASE_WORKFLOW_INPUT,'Set PJM_RELEASE_WORKFLOW_INPUT to a passed fresh-cache workflow evidence directory');
const input=resolve(process.env.PJM_RELEASE_WORKFLOW_INPUT!);
const prior=JSON.parse(readFileSync(join(input,'result.json'),'utf8'));
assert.equal(prior.passed,true);assert.equal(prior.bunVersion,Bun.version);
const evidence=resolve(process.env.PJM_RELEASE_EXPORT_EVIDENCE??join(root,'build/validation/release-native-export-'+Date.now()));
assert.ok(!existsSync(evidence),'Choose a new evidence directory');mkdirSync(evidence,{recursive:true});
const steps:{label:string;exitCode:number;elapsedMs:number}[]=[];
const checks:unknown[]=[];
let failure:string|undefined;
const hash=(bytes:Uint8Array)=>createHash('sha256').update(bytes).digest('hex');
async function run(label:string,args:string[],cwd=root) {
 const start=performance.now();
 const child=Bun.spawn(args,{cwd,env:process.env,stdout:'pipe',stderr:'pipe',detached:true});
 let timedOut=false;
 const timer=setTimeout(()=>{timedOut=true;try{process.kill(-child.pid,'SIGKILL');}catch{child.kill('SIGKILL');}},600000);
 try {
  const [exitCode,out,err]=await Promise.all([child.exited,new Response(child.stdout).text(),new Response(child.stderr).text()]);
  writeFileSync(join(evidence,label+'.log'),out+err);steps.push({label,exitCode,elapsedMs:Math.round(performance.now()-start)});
  console.log(label+': '+exitCode);assert.ok(!timedOut,label+' timed out');assert.equal(exitCode,0,label+' failed; see log');return out;
 } finally {clearTimeout(timer);}
}
try {
 const key=join(input,'publisher.raw');
 for(const platform of ['ios','android']) {
  const output=join(evidence,platform+'-project');
  const args=[join(root,'bin/pjm'),'export-'+platform,'--package',join(input,platform+'.release'),'--public-key',key,'--output',output];
  if(platform==='ios')args.push('--target','simulator');
  await run('export-'+platform,args);
  if(platform==='ios') {
   await run('build-ios',['xcodebuild','-project',join(output,'Mini.xcodeproj'),'-scheme','Mini','-configuration','Release','-sdk','iphonesimulator','-destination','generic/platform=iOS Simulator','-derivedDataPath',join(evidence,'ios-derived'),'CODE_SIGNING_ALLOWED=NO','build']);
   const app=join(evidence,'ios-derived/Build/Products/Release-iphonesimulator/Mini.app');
   assert.ok(existsSync(join(app,'Mini')),'Built iOS executable missing');
   for(const name of ['main.pocket','manifest.json','publisher.key','publisher.trust','app.id']) {
    assert.deepEqual(readFileSync(join(app,name)),readFileSync(join(output,name)),'Built app resource mismatch: '+name);
   }
   assert.deepEqual(readFileSync(join(app,'main.pocket')),readFileSync(join(input,'ios.release/main.pocket')));
   checks.push({platform,app,payloadSha256:hash(readFileSync(join(app,'main.pocket'))),resourcesMatch:true,installed:false});
  } else {
   await run('build-android',['bash',join(output,'build-apk.sh')],output);
   const apk=join(output,'build/Mini-unsigned.apk');assert.ok(existsSync(apk));
   // Python's zip reader preserves binary bytes; command output is not used for
   // comparisons because decoding raw JNI/payload bytes as UTF-8 would corrupt them.
   await run('verify-android-embedding',['python3','-c',[
    'import pathlib,sys,zipfile',
    'project=pathlib.Path(sys.argv[1]); source=pathlib.Path(sys.argv[2])',
    'with zipfile.ZipFile(project/"build/Mini-unsigned.apk") as archive:',
    ' for name in ["main.pocket","manifest.json","publisher.key","publisher.trust"]:',
    '  assert archive.read("assets/"+name)==(project/"assets"/name).read_bytes(),name',
    ' assert archive.read("assets/main.pocket")==source.read_bytes()',
    ' assert archive.read("lib/arm64-v8a/libpocketjs.so")== (project/"lib/arm64-v8a/libpocketjs.so").read_bytes()',
    'print("Exact payload, trust resources and JNI embedding verified")',
   ].join('\n'),output,join(input,'android.release/main.pocket')]);
   const sdk=process.env.ANDROID_SDK_ROOT??process.env.ANDROID_HOME;assert.ok(sdk,'Set ANDROID_SDK_ROOT');
   await run('verify-android-alignment',[join(sdk,'build-tools/36.0.0/zipalign'),'-c','-P','16','4',apk]);
   checks.push({platform,apk,apkSha256:hash(readFileSync(apk)),resourcesMatch:true,installed:false,signedApk:false});
  }
 }
} catch(error) {failure=String(error);throw error;}
finally {
 writeFileSync(join(evidence,'result.json'),JSON.stringify({passed:!failure,failure,bunVersion:Bun.version,input,steps,checks,physicalDeviceUsed:false,simulatorBooted:false,uploaded:false,cleanMachineCovered:false,nativeRuntimeAcceptanceCovered:false},null,2));
}
