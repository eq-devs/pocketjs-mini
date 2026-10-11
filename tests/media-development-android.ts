import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {androidSdk} from '../bin/android.ts';
const root=resolve(import.meta.dir,'..'),sdk=androidSdk();
const evidence=resolve(process.env.PJM_MEDIA_EVIDENCE??join(root,'build/android-validation/media-development-sdk-'+Date.now()));mkdirSync(evidence,{recursive:true});
const serial='emulator-5580';
const cases=process.env.PJM_MEDIA_CASES?.split(',')??['undeclared','deny'];
assert.ok(cases.length>0&&cases.length<=5&&new Set(cases).size===cases.length&&cases.every(mode=>['undeclared','deny','cancel','camera-cancel','camera'].includes(mode)),'Invalid development media cases');
const adb=(...args:string[])=>[join(sdk,'platform-tools/adb'),'-s',serial,...args];
let log='',cleaned=false,emulator:ReturnType<typeof Bun.spawn>|undefined;
let output:Promise<string>|undefined,errors:Promise<string>|undefined;
async function run(args:string[],timeout=30000,env=process.env){const child=Bun.spawn(args,{env,stdout:'pipe',stderr:'pipe'});const timer=setTimeout(()=>child.kill('SIGTERM'),timeout);try{const [status,out,err]=await Promise.all([child.exited,new Response(child.stdout).text(),new Response(child.stderr).text()]);log+=args.join(' ')+'\n'+out+err+'\n';assert.equal(status,0,args[0]+': '+err+'\n'+out);return out.trim();}finally{clearTimeout(timer);}}
try{
 const devices=await run([join(sdk,'platform-tools/adb'),'devices']);assert.ok(!devices.includes(serial),'Owned emulator port is occupied');
 emulator=Bun.spawn([join(sdk,'emulator/emulator'),'-avd','Pixel_2','-port','5580','-read-only','-no-snapshot-load','-no-snapshot-save','-no-window','-no-audio','-gpu','swiftshader_indirect'],{stdout:'pipe',stderr:'pipe'});
 output=new Response(emulator.stdout).text();errors=new Response(emulator.stderr).text();
 const deadline=Date.now()+150000;let ready=false;while(Date.now()<deadline){if(await run(adb('shell','getprop','sys.boot_completed')).catch(()=>'')==='1'){ready=true;break;}await Bun.sleep(500);}assert.ok(ready,'Owned emulator did not boot');
 await run(adb('shell','wm','dismiss-keyguard'));
 for(const mode of cases){await run(adb('shell','pm','clear','dev.pjm.android')).catch(()=>{});await run([process.execPath,join(root,'tests/navigation-native-android.ts'),serial],900000,{...process.env,ANDROID_SDK_ROOT:sdk,PJM_DEVELOPMENT_NETWORK:'1',PJM_DEVELOPMENT_HTTP:'0',PJM_DEVELOPMENT_MEDIA:mode,PJM_NAVIGATION_EVIDENCE:join(evidence,mode)});}
 writeFileSync(join(evidence,'result.json'),JSON.stringify({realSdkMedia:true,cases,declarationDenied:cases.includes('undeclared'),nativeConsentDenied:cases.includes('deny'),nativeChooserCancelled:cases.includes('cancel'),nativeCameraCancelled:cases.includes('camera-cancel'),privateCaptureCleanup:cases.includes('camera-cancel')||cases.includes('camera'),nativeCameraJpegReadRelease:cases.includes('camera'),coldHotPersistence:true,nativePickerSelection:false,physicalAcceptance:false},null,2));
 console.log('Owned Android development SDK media cases and cold/hot checks passed.');
}finally{
 if(emulator){const diagnostic=await run(adb('logcat','-d','-v','brief','AndroidRuntime:E','PocketJS:E','*:S')).catch(()=>'');writeFileSync(join(evidence,'native-errors.log'),diagnostic);await run(adb('emu','kill')).catch(()=>{});const timer=setTimeout(()=>emulator!.kill('SIGTERM'),10000);try{await emulator.exited;cleaned=true;}finally{clearTimeout(timer);}writeFileSync(join(evidence,'emulator.log'),(await output??'')+(await errors??''));}
 writeFileSync(join(evidence,'owned-emulator.json'),JSON.stringify({serial,avd:'Pixel_2',readOnly:true,owned:true,cleaned},null,2));writeFileSync(join(evidence,'owned-device-and-test.log'),log);
}
