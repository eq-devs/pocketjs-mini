import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync,statSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {androidSdk} from '../bin/android.ts';
const root=resolve(import.meta.dir,'..'),sdk=androidSdk();
const evidence=resolve(process.env.PJM_HTTP_EVIDENCE??join(root,'build/android-validation/http-development-sdk-'+Date.now()));mkdirSync(evidence,{recursive:true});
const serial='emulator-5580',mixed=process.env.PJM_HTTP_MEDIA==='1';
const adb=(...args:string[])=>[join(sdk,'platform-tools/adb'),'-s',serial,...args];
let log='',cleaned=false,emulator:ReturnType<typeof Bun.spawn>|undefined;
let output:Promise<string>|undefined,errors:Promise<string>|undefined;
const traceEnabled=process.env.PJM_HTTP_TRACE==='1',traceKey='pjm-http-media-'+Date.now();
const traceRemote='/data/misc/perfetto-traces/'+traceKey+'.perfetto-trace',traceConfigRemote='/data/misc/perfetto-configs/'+traceKey+'.pbtxt';
let traceStarted=false;
async function run(args:string[],timeout=30000,env=process.env){const child=Bun.spawn(args,{env,stdout:'pipe',stderr:'pipe'});const timer=setTimeout(()=>child.kill('SIGTERM'),timeout);try{const [status,out,err]=await Promise.all([child.exited,new Response(child.stdout).text(),new Response(child.stderr).text()]);log+=args.join(' ')+'\n'+out+err+'\n';assert.equal(status,0,args[0]+': '+err+'\n'+out);return out.trim();}finally{clearTimeout(timer);}}
try{
 const devices=await run([join(sdk,'platform-tools/adb'),'devices']);assert.ok(!devices.includes(serial),'Owned emulator port is occupied');
 emulator=Bun.spawn([join(sdk,'emulator/emulator'),'-avd','Pixel_2','-port','5580','-read-only','-no-snapshot-load','-no-snapshot-save','-no-window','-no-audio','-gpu','swiftshader_indirect'],{stdout:'pipe',stderr:'pipe'});
 output=new Response(emulator.stdout).text();errors=new Response(emulator.stderr).text();
 const deadline=Date.now()+150000;let ready=false;while(Date.now()<deadline){if(await run(adb('shell','getprop','sys.boot_completed')).catch(()=>'')==='1'){ready=true;break;}await Bun.sleep(500);}assert.ok(ready,'Owned emulator did not boot');
 await run(adb('shell','wm','dismiss-keyguard'));
 if(traceEnabled){
  const config=join(evidence,'scheduler-trace.pbtxt');
  writeFileSync(config,`duration_ms: 900000
write_into_file: true
file_write_period_ms: 1000000000
buffers { size_kb: 32768 fill_policy: RING_BUFFER }
data_sources { config { name: "linux.ftrace" ftrace_config {
 buffer_size_kb: 4096
 drain_period_ms: 100
 ftrace_events: "sched/sched_switch"
 ftrace_events: "sched/sched_waking"
 atrace_apps: "dev.pjm.android"
} } }
data_sources { config { name: "linux.process_stats" process_stats_config { scan_all_processes_on_start: true proc_stats_poll_ms: 1000 } } }
`);
  await run(adb('push',config,traceConfigRemote));
  await run(adb('shell','perfetto','--txt','-c',traceConfigRemote,'--detach='+traceKey,'-o',traceRemote));traceStarted=true;
  await run(adb('shell','perfetto','--is_detached='+traceKey));
 }

 await run([process.execPath,join(root,'tests/navigation-native-android.ts'),serial],900000,{...process.env,ANDROID_SDK_ROOT:sdk,PJM_DEVELOPMENT_NETWORK:'1',PJM_DEVELOPMENT_HTTP:'1',...(mixed?{PJM_DEVELOPMENT_HTTP_MEDIA:'1',PJM_DEVELOPMENT_MEDIA:'camera'}:{}),PJM_NAVIGATION_EVIDENCE:evidence});
 if(process.env.PJM_HTTP_SIGNED_NAVIGATION==='1')await run([process.execPath,join(root,'tests/navigation-signed-android.ts'),serial],900000,{...process.env,ANDROID_SDK_ROOT:sdk,PJM_NAVIGATION_EVIDENCE:join(evidence,'signed-host')});
 console.log(mixed?'Owned Android actual HTTP/camera shared resource quota, reuse and cold/live checks passed.':'Owned Android development live HTTPS, domain denial, resource read/release, cold reopen and hot reload passed.');
}finally{
 if(traceStarted){
  const traceReceipt:{key:string,stopConfirmed:boolean,bytes:number,error?:string}={key:traceKey,stopConfirmed:false,bytes:0};
  try{await run(adb('shell','perfetto','--attach='+traceKey,'--stop'));traceReceipt.stopConfirmed=true;const target=join(evidence,'scheduler.perfetto-trace');await run(adb('pull',traceRemote,target));traceReceipt.bytes=statSync(target).size;assert.ok(traceReceipt.bytes>0,'Empty scheduler trace');}catch(error){traceReceipt.error=String(error);}
  writeFileSync(join(evidence,'scheduler-trace-result.json'),JSON.stringify(traceReceipt,null,2));
  await run(adb('shell','rm','-f',traceRemote,traceConfigRemote)).catch(()=>{});
 }
 if(emulator){const diagnostic=await run(adb('logcat','-d','-v','brief','AndroidRuntime:E','PocketJS:E','*:S')).catch(()=>'');writeFileSync(join(evidence,'native-errors.log'),diagnostic);await run(adb('emu','kill')).catch(()=>{});const timer=setTimeout(()=>emulator!.kill('SIGTERM'),10000);try{await emulator.exited;cleaned=true;}finally{clearTimeout(timer);}writeFileSync(join(evidence,'emulator.log'),(await output??'')+(await errors??''));}
 writeFileSync(join(evidence,'owned-emulator.json'),JSON.stringify({serial,avd:'Pixel_2',readOnly:true,owned:true,cleaned},null,2));writeFileSync(join(evidence,'owned-device-and-test.log'),log);
}
