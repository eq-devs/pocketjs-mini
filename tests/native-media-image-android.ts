import {mkdirSync,mkdtempSync,writeFileSync,readFileSync,rmSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import assert from 'node:assert/strict';
import {androidMediaFiles} from '../bin/android-media.ts';
import {androidSdk} from '../bin/android.ts';
const service=process.env.PJM_MEDIA_SERVICE==='1',resourceProcess=process.env.PJM_RESOURCE_PROCESS==='1';assert.ok(!(service&&resourceProcess),'Choose one native test mode');
const minimumApi=resourceProcess?23:26;
const proofPrefix=resourceProcess?'native-resource-process':'native-media-image';
const root=resolve(import.meta.dir,'..'),serial=Bun.argv[2];if(!serial||!/^[a-zA-Z0-9_.:-]+$/.test(serial))throw Error('Usage: bun tests/native-media-image-android.ts <adb serial>');
const temp=mkdtempSync(join(tmpdir(),'pjm-media-image-')),bundle='dev.pjm.media.image.a'+Date.now(),sdk=androidSdk(),java=process.env.JAVA_HOME??'/Library/Java/JavaVirtualMachines/jdk-17.jdk/Contents/Home';
const evidence=resolve(process.env.PJM_MEDIA_EVIDENCE??join(root,'build/android-validation/media-image-'+Date.now()));mkdirSync(evidence,{recursive:true});
const adb=(...args:string[])=>[join(sdk,'platform-tools/adb'),'-s',serial,...args];const xmlPath='/data/local/tmp/'+temp.split('/').pop()+'.xml';let installed=false;let log='';
const activity=resourceProcess?'dev.pjm.android.NativeResourceProcessActivity':service?'dev.pjm.android.NativeMediaServiceActivity':'dev.pjm.android.NativeMediaImageActivity';
async function run(args:string[],cwd?:string){const child=Bun.spawn(args,{cwd,stdout:'pipe',stderr:'pipe'});const timer=setTimeout(()=>child.kill('SIGTERM'),30000);try{const [status,out,err]=await Promise.all([child.exited,new Response(child.stdout).text(),new Response(child.stderr).text()]);log+=args[0]+'\n'+out+err;assert.equal(status,0,args[0]+': '+err+'\n'+out);return out.trim();}finally{clearTimeout(timer);}}
async function wait<T>(read:()=>Promise<T>,accept:(value:T)=>boolean){const deadline=Date.now()+60000;let last:unknown;while(Date.now()<deadline){try{const value=await read();if(typeof value==='string'&&value.includes(proofPrefix+' FAIL'))throw Error(value);if(accept(value))return value;last=value;}catch(error){if(String(error).includes(proofPrefix+' FAIL'))throw error;last=String(error);}await Bun.sleep(250);}throw Error('Native media timeout: '+JSON.stringify(last));}
try{
 await wait(()=>run(adb('shell','getprop','sys.boot_completed')),value=>value==='1');
 for(const name of ['classes','dex','assets'])mkdirSync(join(temp,name));
 writeFileSync(join(temp,'AndroidManifest.xml'),`<manifest xmlns:android="http://schemas.android.com/apk/res/android" package="${bundle}"><uses-sdk android:minSdkVersion="${minimumApi}" android:targetSdkVersion="34"/><application android:label="Native media codec test" android:debuggable="true" android:allowBackup="false" android:theme="@android:style/Theme.Material.NoActionBar"><activity android:name="${activity}" android:exported="true"><intent-filter><action android:name="android.intent.action.MAIN"/><category android:name="android.intent.category.LAUNCHER"/></intent-filter></activity></application></manifest>`);
 if(service||resourceProcess){
  const fixture=Bun.spawn([process.execPath,join(root,'tests/package-load-fixtures.ts'),join(temp,'assets/cases.json')],{env:{...process.env,PJM_PACKAGE_TARGET:'android',PJM_PACKAGE_REAL:'',...(resourceProcess?{PJM_PACKAGE_HTTP_TEST:'',PJM_PACKAGE_LOCATION_SDK_TEST:'',PJM_PACKAGE_BACK_TEST:''}:{})},stdout:'pipe',stderr:'pipe'});const [status,out,err]=await Promise.all([fixture.exited,new Response(fixture.stdout).text(),new Response(fixture.stderr).text()]);assert.equal(status,0,out+err);if(resourceProcess)writeFileSync(join(evidence,'signed-fixtures.json'),readFileSync(join(temp,'assets/cases.json')));
  mkdirSync(join(temp,'lib/arm64-v8a'),{recursive:true});const ndk=join(sdk,'ndk/28.2.13676358/toolchains/llvm/prebuilt/darwin-x86_64/bin');
  await run([join(ndk,'aarch64-linux-android23-clang'),'-Wall','-Wextra','-Werror','-fPIC','-shared','-Wl,--gc-sections','-Wl,--exclude-libs,ALL','-Wl,--no-undefined','-Wl,-z,max-page-size=16384','-I',join(root,'core-ffi/include'),...['package_bridge.c','pool_bridge.c','store_bridge.c'].map(name=>join(root,'host/android',name)),join(root,'core-ffi/target/aarch64-linux-android/release/libmini_core_ffi.a'),'-lEGL','-lGLESv2','-ldl','-lm','-llog','-o',join(temp,'lib/arm64-v8a/libpocketjs.so')]);
 }
 const tools=join(sdk,'build-tools/36.0.0'),android=join(sdk,'platforms/android-34/android.jar');
 const mediaJars:string[]=[];if(!resourceProcess)for(const [name,bytes]of androidMediaFiles().files)if(name.endsWith('.jar')){const path=join(temp,name);writeFileSync(path,bytes);mediaJars.push(path);}
 await run([join(tools,'aapt2'),'link','-o',join(temp,'unsigned.apk'),'-I',android,'--manifest',join(temp,'AndroidManifest.xml'),'-A',join(temp,'assets')]);
 await run([join(java,'bin/javac'),'-source','8','-target','8','-classpath',[android,...mediaJars].join(':'),'-d',join(temp,'classes'),...(resourceProcess?[join(root,'host/android/ManagedResources.java'),join(root,'tests/NativeResourceProcessActivity.java')]:[join(root,'host/android/MediaContract.java'),join(root,'host/android/MediaImage.java'),join(root,service?'tests/NativeMediaServiceActivity.java':'tests/NativeMediaImageActivity.java')]),...(service?['MediaInput','VerifiedMedia','VerifiedPackage','PackageVerifier','BoundedJson','ManagedResources'].map(name=>join(root,'host/android',name+'.java')):resourceProcess?['VerifiedPackage','PackageVerifier','BoundedJson'].map(name=>join(root,'host/android',name+'.java')):[])]);
 await run([join(java,'bin/jar'),'cf',join(temp,'classes.jar'),'-C',join(temp,'classes'),'.']);
 await run([join(tools,'d8'),'--min-api',String(minimumApi),'--lib',android,'--output',join(temp,'dex'),join(temp,'classes.jar'),...mediaJars]);
 await run(['zip','-j',join(temp,'unsigned.apk'),join(temp,'dex/classes.dex')]);if(service||resourceProcess)await run(['zip','-q','-r',join(temp,'unsigned.apk'),'lib'],temp);await run([join(tools,'zipalign'),'-f','-P','16','4',join(temp,'unsigned.apk'),join(temp,'aligned.apk')]);
 await run([join(java,'bin/keytool'),'-genkeypair','-keystore',join(temp,'test.jks'),'-storepass','android','-keypass','android','-alias','test','-keyalg','RSA','-validity','1','-dname','CN=Temporary PocketJS Media Test']);
 await run([join(tools,'apksigner'),'sign','--ks',join(temp,'test.jks'),'--ks-pass','pass:android','--out',join(temp,'test.apk'),join(temp,'aligned.apk')]);await run(adb('install',join(temp,'test.apk')));installed=true;
 await run(adb('shell','am','start','-W','-n',bundle+'/'+activity));
 const proof=await wait(async()=>{await run(adb('shell','uiautomator','dump',xmlPath));return run(adb('shell','cat',xmlPath));},value=>value.includes('package="'+bundle+'"')&&value.includes(proofPrefix+' PASS'));
 if(resourceProcess){
  const match=proof.match(/(?:text|content-desc)=(["'])native-resource-process PASS (.*?)\1/);assert.ok(match,'Native resource receipt required');
  const receipt=JSON.parse(match[2].replace(/&quot;/g,'"').replace(/&apos;/g,"'").replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&amp;/g,'&'));
  for(const [key,value]of Object.entries({authenticatedIdentities:4,owners:8,rounds:64,contendedAdmissions:1024,processCap:16,perGenerationCap:4}))assert.equal(receipt[key],value,key);
  assert.ok(receipt.delayedProducerChecks>0);writeFileSync(join(evidence,'native-resource-receipt.json'),JSON.stringify(receipt,null,2)+'\n');
 }
 writeFileSync(join(evidence,'proof.xml'),proof);writeFileSync(join(evidence,'result.json'),JSON.stringify({nativeAndroidCodec:!service&&!resourceProcess,nativeMediaService:service,sharedResourceQuota:service,isolation:service,cancellation:service,providerOverflow:service,resize:!service&&!resourceProcess,orientation:!service&&!resourceProcess,metadataStripped:!service&&!resourceProcess,alphaWhite:!service&&!resourceProcess,sourceLimits:!resourceProcess,concurrentResourceProcessCap:resourceProcess,authenticatedResourceIdentities:resourceProcess?4:0,controlledProducerTokens:resourceProcess,actualHttpMediaWorkers:false,delayedProducerRetirement:resourceProcess,physicalAcceptance:false,pickerUiAcceptance:false},null,2));console.log(resourceProcess?'Native Android concurrent resource-process checks passed.':'Native Android media image checks passed.');
}finally{if(installed)await run(adb('uninstall',bundle)).catch(()=>{});await run(adb('shell','rm','-f',xmlPath)).catch(()=>{});writeFileSync(join(evidence,'commands.log'),log);rmSync(temp,{recursive:true,force:true});}
