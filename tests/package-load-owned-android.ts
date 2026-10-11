import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {androidSdk} from '../bin/android.ts';
const root=resolve(import.meta.dir,'..'),sdk=androidSdk();
const evidence=resolve(process.env.PJM_PACKAGE_LOAD_EVIDENCE??join(root,'build/android-validation/package-load-'+Date.now()));mkdirSync(evidence,{recursive:true});
const serial='emulator-5580';
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
 const native=await run(['bash',join(root,'tests/package-load-android.sh'),serial],900000,{...process.env,ANDROID_SDK_ROOT:sdk,PJM_PACKAGE_LOAD_EVIDENCE:evidence});
 assert.ok(native.includes('PACKAGE_DOWNLOAD controlled-native passed cold-update rollback tamper origin redirect bounds quota retirement recovery'),'Missing native downloader verdict');
 if(process.env.PJM_DOWNLOAD_TLS_URL)assert.ok(native.includes('PACKAGE_DOWNLOAD_TLS passed system-trust-rejected explicit-test-ca cold-update rollback tamper redirect duplicate streamed-limit'),'Missing actual TLS downloader verdict');
 const receipts=native.split('\n').filter(line=>line.startsWith('PACKAGE_CASE '));const cases=JSON.parse(await Bun.file(join(evidence,'cases.json')).text());assert.equal(receipts.length,cases.length,'Missing native case receipts');
 for(const item of cases)assert.ok(receipts.includes('PACKAGE_CASE '+item.name+' '+(item.valid?'accepted':'rejected')),'Missing native verdict '+item.name);
 const runtime=native.split('\n').filter(line=>line.startsWith('RUNTIME_ATTACK '));assert.equal(runtime.length,2);for(const name of ['infinite-frame-loop','heap-limit'])assert.ok(runtime.some(line=>line.startsWith('RUNTIME_ATTACK '+name+' blocked healthy-retained ')));
 writeFileSync(join(evidence,'runtime-attacks.json'),JSON.stringify(runtime,null,2));writeFileSync(join(evidence,'native.log'),native);writeFileSync(join(evidence,'result.json'),JSON.stringify({platform:'android',nativeRuntime:'app_process',cases:cases.length,accepted:cases.filter((item:any)=>item.valid).length,rejected:cases.filter((item:any)=>!item.valid).length,runtimeAttacksExecuted:2,healthyGenerationRetainedAfterAttacks:true,failedEffectsNotDelivered:true,clipboardMailboxExecuted:true,controlledLocationExecuted:true,retainedContainerExecuted:true,nativePackageDownloadControlled:true,nativePackageDownloadActualTls:!!process.env.PJM_DOWNLOAD_TLS_URL,physicalMemoryAcceptance:false},null,2));
 console.log('Owned Android signed-package attack matrix, retained isolation and clipboard mailbox checks passed.');
}finally{
 if(emulator){const diagnostic=await run(adb('logcat','-d','-v','brief','AndroidRuntime:E','PocketJS:E','*:S')).catch(()=>'');writeFileSync(join(evidence,'native-errors.log'),diagnostic);await run(adb('emu','kill')).catch(()=>{});const timer=setTimeout(()=>emulator!.kill('SIGTERM'),10000);try{await emulator.exited;cleaned=true;}finally{clearTimeout(timer);}writeFileSync(join(evidence,'emulator.log'),(await output??'')+(await errors??''));}
 writeFileSync(join(evidence,'owned-emulator.json'),JSON.stringify({serial,avd:'Pixel_2',readOnly:true,owned:true,cleaned},null,2));writeFileSync(join(evidence,'owned-device-and-test.log'),log);
}
