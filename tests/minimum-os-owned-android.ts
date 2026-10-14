import assert from 'node:assert/strict';
import {existsSync,mkdirSync,mkdtempSync,readFileSync,rmSync,writeFileSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {provisionOwnedMedia} from './owned-media-android.ts';
import {androidSdk} from '../bin/android.ts';

// Use an installed official image and an isolated AVD home. Never reuse or
// rewrite a user's saved emulator to establish minimum-version acceptance.
const api=Number(Bun.argv[2]);assert.ok(api===23||api===26,'Pass API 23 or API 26');
const resourceProcess=process.env.PJM_RESOURCE_PROCESS==='1';
const clipboardMatrix=process.env.PJM_MINIMUM_CLIPBOARD_MATRIX==='1';assert.ok(!clipboardMatrix||api===23,'Clipboard matrix requires the API 23 development host');
const locationMatrix=process.env.PJM_MINIMUM_LOCATION_MATRIX==='1';assert.ok(!locationMatrix||api===23,'Location matrix requires the API 23 development host');
const mediaCases=process.env.PJM_MINIMUM_MEDIA_CASES?.split(',');assert.ok(!mediaCases||(api===23&&mediaCases.length>0&&mediaCases.length<=5&&new Set(mediaCases).size===mediaCases.length&&mediaCases.every(mode=>['undeclared','deny','cancel','camera-cancel','camera'].includes(mode))),'Invalid API 23 media cases');
assert.ok(Number(clipboardMatrix)+Number(locationMatrix)+Number(!!mediaCases)+Number(resourceProcess)<=1,'Choose one permission matrix per run');
const root=resolve(import.meta.dir,'..'),sdk=androidSdk();
const image=join(sdk,'system-images','android-'+api,'google_apis','arm64-v8a');
assert.ok(existsSync(join(image,'package.xml')),'Install the official ARM64 Google APIs image first');
const evidence=resolve(process.env.PJM_PACKAGE_LOAD_EVIDENCE??join(root,'build/android-validation/minimum-api'+api+'-'+Date.now()));
mkdirSync(evidence,{recursive:true});
const temp=mkdtempSync('/private/tmp/pjm-minimum-android-'),avd='pjm-minimum-'+api+'-'+Date.now(),serial='emulator-5580';
const env={...process.env,ANDROID_SDK_ROOT:sdk,PJM_PACKAGE_LOAD_EVIDENCE:evidence,PJM_NAVIGATION_EVIDENCE:evidence,JAVA_HOME:process.env.JAVA_HOME??'/Library/Java/JavaVirtualMachines/jdk-17.jdk/Contents/Home',ANDROID_USER_HOME:join(temp,'user'),ANDROID_AVD_HOME:join(temp,'avds')};
mkdirSync(env.ANDROID_USER_HOME);mkdirSync(env.ANDROID_AVD_HOME);
const adb=(...args:string[])=>[join(sdk,'platform-tools/adb'),'-s',serial,...args];
let feeding=false,feed:Promise<void>|undefined,feedFailure:unknown;
let fixtureCleanup:(()=>Promise<void>)|undefined;
let emulator:ReturnType<typeof Bun.spawn>|undefined,output:Promise<string>|undefined,errors:Promise<string>|undefined,cleaned=false,log='';
async function run(args:string[],timeout=30000,input?:string,overrides:Record<string,string>={}){
 const child=Bun.spawn(args,{env:{...env,...overrides},stdout:'pipe',stderr:'pipe',stdin:input===undefined?'ignore':'pipe'});
 if(input!==undefined){(child.stdin as Bun.FileSink).write(input);(child.stdin as Bun.FileSink).end();}
 const timer=setTimeout(()=>child.kill('SIGTERM'),timeout);
 try{const [status,out,err]=await Promise.all([child.exited,new Response(child.stdout).text(),new Response(child.stderr).text()]);log+=args.join(' ')+'\n'+out+err+'\n';assert.equal(status,0,args[0]+': '+err+'\n'+out);return out.trim();}finally{clearTimeout(timer);}
}
try{
 assert.ok(!(await run([join(sdk,'platform-tools/adb'),'devices'])).includes(serial),'Owned emulator port is occupied');
 await run([join(sdk,'cmdline-tools/latest/bin/avdmanager'),'create','avd','--name',avd,'--package','system-images;android-'+api+';google_apis;arm64-v8a','--device','pixel_2','--path',join(temp,'device.avd')],120000,'no\n');
 writeFileSync(join(evidence,'avd-config.ini'),readFileSync(join(temp,'device.avd/config.ini')));
 emulator=Bun.spawn([join(sdk,'emulator/emulator'),'-avd',avd,'-port','5580','-read-only','-memory','4096','-no-snapshot-load','-no-snapshot-save','-no-window','-no-audio','-gpu','swiftshader_indirect'],{env,stdout:'pipe',stderr:'pipe'});
 output=new Response(emulator.stdout).text();errors=new Response(emulator.stderr).text();let exit:number|undefined;void emulator.exited.then(code=>{exit=code;});
 const deadline=Date.now()+180000;let booted=false;
 while(Date.now()<deadline){assert.equal(exit,undefined,'Owned emulator exited before boot');if(await run(adb('shell','getprop','sys.boot_completed')).catch(()=>'')==='1'){booted=true;break;}await Bun.sleep(500);}
 assert.ok(booted,'Owned emulator did not boot');
 const actual=Number(await run(adb('shell','getprop','ro.build.version.sdk')));assert.equal(actual,api);
 writeFileSync(join(evidence,'runtime.json'),JSON.stringify({requestedApi:api,actualApi:actual,fingerprint:await run(adb('shell','getprop','ro.build.fingerprint')),abi:await run(adb('shell','getprop','ro.product.cpu.abi'))},null,2));
 await run(adb('shell','wm','dismiss-keyguard'));
 if(api===23&&env.PJM_DEVELOPMENT_MEDIA==='library'){const name='pjm-owned-minimum-'+Date.now()+'.png';fixtureCleanup=await provisionOwnedMedia(root,sdk,serial,name,evidence);env.PJM_MEDIA_LIBRARY_NAME=name;}
 if(locationMatrix||env.PJM_DEVELOPMENT_LOCATION==='allow'){
  await run(adb('shell','settings','put','secure','location_mode','3'));
  for(const setting of ['window_animation_scale','transition_animation_scale','animator_duration_scale'])await run(adb('shell','settings','put','global',setting,'0'));
  feeding=true;feed=(async()=>{try{while(feeding){await run(adb('emu','geo','fix','76.889709','43.238949','800','12','0'));await Bun.sleep(1000);}}catch(error){feedFailure=error;}})();
 }
 if(resourceProcess){
  await run([process.execPath,join(root,'tests/native-media-image-android.ts'),serial],900000,undefined,{PJM_MEDIA_SERVICE:'0',PJM_MEDIA_EVIDENCE:evidence});
 }else if(mediaCases){
  for(const [index,mode] of mediaCases.entries()){
   if(index>0)await run(adb('shell','pm','clear','dev.pjm.android'));
   await run([process.execPath,join(root,'tests/navigation-native-android.ts'),serial],900000,undefined,{PJM_DEVELOPMENT_NETWORK:'1',PJM_DEVELOPMENT_MEDIA:mode,PJM_NAVIGATION_EVIDENCE:join(evidence,mode)});
  }
 }else if(clipboardMatrix||locationMatrix){
  for(const [index,mode] of ['undeclared','deny','allow'].entries()){
   if(index>0)await run(adb('shell','pm','clear','dev.pjm.android'));
   await run([process.execPath,join(root,'tests/navigation-native-android.ts'),serial],900000,undefined,{PJM_DEVELOPMENT_NETWORK:'1',...(clipboardMatrix?{PJM_DEVELOPMENT_CLIPBOARD_READ:mode}:{PJM_DEVELOPMENT_LOCATION:mode}),PJM_NAVIGATION_EVIDENCE:join(evidence,mode)});
  }
 }else await run([process.execPath,join(root,api===26?'tests/package-update-ui-android.ts':'tests/navigation-native-android.ts'),serial],900000);
 assert.equal(feedFailure,undefined,'Location feeder failed');
 writeFileSync(join(evidence,'minimum-os-result.json'),JSON.stringify({actualApi:api,installedSignedTsxHttpsUpdateAndRollbackPassed:api===26&&!resourceProcess,developmentTsxNavigationPassed:api===23&&!resourceProcess,authenticatedResourceProcessStressPassed:resourceProcess,developmentClipboardMatrixPassed:clipboardMatrix,developmentLocationMatrixPassed:locationMatrix,developmentMediaCases:mediaCases??null,physicalAcceptance:false},null,2));
}finally{
 feeding=false;await feed;
 let cleanupError:unknown;
 if(fixtureCleanup)try{await fixtureCleanup();}catch(error){cleanupError=error;log+='Fixture cleanup failed: '+String(error)+'\n';}
 if(emulator){await run(adb('emu','kill')).catch(()=>{});const timer=setTimeout(()=>emulator!.kill('SIGTERM'),10000);try{await emulator.exited;cleaned=true;}finally{clearTimeout(timer);}writeFileSync(join(evidence,'emulator.log'),(await output??'')+(await errors??''));}
 rmSync(temp,{recursive:true,force:true});
 writeFileSync(join(evidence,'owned-emulator.json'),JSON.stringify({serial,avd,api,isolatedAvdHome:true,temporaryAvdRemoved:true,readOnly:true,cleaned,preexistingAvdsUnchanged:true},null,2));
 writeFileSync(join(evidence,'owned-device-and-test.log'),log);
 if(cleanupError)throw cleanupError;
}
