import {provisionOwnedMedia} from './owned-media-android.ts';
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {createHash} from 'node:crypto';
import {androidSdk} from '../bin/android.ts';
import {ownedMediaPng} from './media-library-fixture.ts';
const development=process.env.PJM_MEDIA_DEVELOPMENT==='1',fixtureOnly=process.env.PJM_MEDIA_FIXTURE_ONLY==='1';assert.ok(!fixtureOnly||development,'Fixture-only validation requires development provisioning');
const root=resolve(import.meta.dir,'..'),sdk=androidSdk();
const evidence=resolve(process.env.PJM_MEDIA_LIBRARY_EVIDENCE??join(root,'build/android-validation/media-library-'+Date.now()));mkdirSync(evidence,{recursive:true});
const serial='emulator-5580',name='pjm-owned-'+Date.now()+'.png',remote='/sdcard/Download/'+name;
const png=ownedMediaPng(),fixture=join(evidence,'owned-fixture.png');writeFileSync(fixture,png);
const adb=(...args:string[])=>[join(sdk,'platform-tools/adb'),'-s',serial,...args];
let fixtureCleanup:(()=>Promise<void>)|undefined;
let log='',cleaned=false,emulator:ReturnType<typeof Bun.spawn>|undefined;
let output:Promise<string>|undefined,errors:Promise<string>|undefined;
async function run(args:string[],timeout=30000,env=process.env){const child=Bun.spawn(args,{env,stdout:'pipe',stderr:'pipe'});const timer=setTimeout(()=>child.kill('SIGTERM'),timeout);try{const [status,out,err]=await Promise.all([child.exited,new Response(child.stdout).text(),new Response(child.stderr).text()]);log+=args.join(' ')+'\n'+out+err+'\n';assert.equal(status,0,args[0]+': '+err+'\n'+out);return out.trim();}finally{clearTimeout(timer);}}
try{
 const devices=await run([join(sdk,'platform-tools/adb'),'devices']);assert.ok(!devices.includes(serial),'Owned emulator port is occupied');
 emulator=Bun.spawn([join(sdk,'emulator/emulator'),'-avd','Pixel_2','-port','5580','-read-only','-no-snapshot-load','-no-snapshot-save','-no-window','-no-audio','-gpu','swiftshader_indirect'],{stdout:'pipe',stderr:'pipe'});
 output=new Response(emulator.stdout).text();errors=new Response(emulator.stderr).text();
 const deadline=Date.now()+150000;let ready=false;while(Date.now()<deadline){if(await run(adb('shell','getprop','sys.boot_completed')).catch(()=>'')==='1'){ready=true;break;}await Bun.sleep(500);}assert.ok(ready,'Owned emulator did not boot');
 await run(adb('shell','wm','dismiss-keyguard'));
 const storageDeadline=Date.now()+60000;let storageReady=false;while(Date.now()<storageDeadline){if(await run(adb('shell','test','-d','/sdcard')).then(()=>true,()=>false)){storageReady=true;break;}await Bun.sleep(500);}assert.ok(storageReady,'Owned emulator shared storage did not mount');
 if(development)fixtureCleanup=await provisionOwnedMedia(root,sdk,serial,name,evidence);
 if(!fixtureOnly)await run([process.execPath,join(root,development?'tests/navigation-native-android.ts':'tests/navigation-signed-android.ts'),serial],900000,{...process.env,ANDROID_SDK_ROOT:sdk,PJM_MEDIA_UI_CASE:'library',PJM_MEDIA_LIBRARY_NAME:name,PJM_NAVIGATION_EVIDENCE:evidence,...(development?{PJM_DEVELOPMENT_MEDIA:'library',PJM_DEVELOPMENT_NETWORK:'1',PJM_DEVELOPMENT_HTTP:'0'}:{})});
}finally{
 let cleanupFailure:unknown;
 if(fixtureCleanup)try{await fixtureCleanup();}catch(error){cleanupFailure=error;log+='Fixture cleanup failure: '+String(error)+'\n';}
 if(emulator){await run(adb('emu','kill')).catch(()=>{});const timer=setTimeout(()=>emulator!.kill('SIGTERM'),10000);try{await emulator.exited;cleaned=true;}finally{clearTimeout(timer);}writeFileSync(join(evidence,'emulator.log'),(await output??'')+(await errors??''));}
 writeFileSync(join(evidence,'owned-emulator.json'),JSON.stringify({serial,avd:'Pixel_2',readOnly:true,owned:true,fixture:'owned-fixture.png',width:64,height:32,fixtureSha256:createHash('sha256').update(png).digest('hex'),remote,fixtureProvisioning:'test-only-app-owned-MediaStore',fixtureOnly,fixtureCleanup:fixtureCleanup?(cleanupFailure?'failed':'passed'):'not-applicable',cleaned},null,2));writeFileSync(join(evidence,'owned-device-and-test.log'),log);
 if(cleanupFailure)throw cleanupFailure;
}

console.log(fixtureOnly?'Owned Android media fixture provisioning, byte readback and cleanup passed.':'Owned Android system chooser and SDK resource checks passed.');
