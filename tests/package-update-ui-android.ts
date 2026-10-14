import assert from 'node:assert/strict';
import {cpSync,mkdirSync,mkdtempSync,readFileSync,writeFileSync,rmSync,statSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {androidSdk} from '../bin/android.ts';
import {writeInstalledAndroidProject} from '../bin/installed-android-project.ts';
import {updateFixture} from './package-update-fixture.ts';
const root=resolve(import.meta.dir,'..'),serial=Bun.argv[2];assert.match(serial??'',/^[a-zA-Z0-9_.:-]+$/);
const evidence=resolve(process.env.PJM_PACKAGE_LOAD_EVIDENCE??join(root,'build/android-validation/installed-update-'+Date.now()));mkdirSync(evidence,{recursive:true});
const temp=mkdtempSync('/private/tmp/pjm-installed-update-android-'),bundle='dev.pjm.update.a'+Date.now(),activity='dev.pjm.android.UpdateSurfaceActivity';
const sdk=androidSdk(),java=process.env.JAVA_HOME??'/Library/Java/JavaVirtualMachines/jdk-17.jdk/Contents/Home',ndk=join(sdk,'ndk/28.2.13676358/toolchains/llvm/prebuilt/darwin-x86_64/bin');
const python=process.env.PJM_PIXEL_PYTHON??'/Users/estai/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3';
const adb=(...args:string[])=>[join(sdk,'platform-tools/adb'),'-s',serial,...args],xmlPath='/data/local/tmp/'+bundle+'.xml';
const keyTransition=process.env.PJM_UPDATE_KEY_TRANSITION==='1';
const lifecycleCycles=Number(process.env.PJM_UPDATE_LIFECYCLE_CYCLES??'1');assert.ok(Number.isSafeInteger(lifecycleCycles)&&lifecycleCycles>=1&&lifecycleCycles<=50,'Lifecycle cycle count must be 1..50');
let servePrevious=false;
const guestTurnTracing=process.env.PJM_GUEST_TURN_TRACE==='1';
const tracing=process.env.PJM_UPDATE_TRACE==='1',traceKey='pjm-installed-update-'+Date.now(),traceRemote='/data/misc/perfetto-traces/'+traceKey+'.perfetto-trace',traceConfigRemote='/data/misc/perfetto-configs/'+traceKey+'.pbtxt';let traceStarted=false;
let installed=false,reversed=false,server:ReturnType<typeof Bun.serve>|undefined,log='';const requests:string[]=[];
async function run(args:string[],timeout=30000,env=process.env){const child=Bun.spawn(args,{env,stdout:'pipe',stderr:'pipe'});const timer=setTimeout(()=>child.kill('SIGTERM'),timeout);try{const [status,out,err]=await Promise.all([child.exited,new Response(child.stdout).text(),new Response(child.stderr).text()]);log+=args.join(' ')+'\n'+out+err+'\n';assert.equal(status,0,err+'\n'+out);return out.trim();}finally{clearTimeout(timer);}}
async function xml(){await run(adb('shell','rm','-f',xmlPath));const output=await run(adb('shell','uiautomator','dump',xmlPath));assert.ok(output.includes('UI hierchary dumped'),'Missing fresh hierarchy');return run(adb('shell','cat',xmlPath));}
async function proof(value:string,name:string){const end=Date.now()+60000;let last='';while(Date.now()<end){last=await xml();if(last.includes('text="Cannot open installed mini app"')||last.includes('content-desc="native-installed-failure"')){writeFileSync(join(evidence,'native-failure.xml'),last);throw Error('Native installed host failed');}if(last.includes('content-desc="'+value+'"')){writeFileSync(join(evidence,name+'.xml'),last);return last;}await Bun.sleep(250);}writeFileSync(join(evidence,'timeout.xml'),last);throw Error('Missing '+value);}
function bounds(node:string){const match=node.match(/bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/);assert.ok(match);return match.slice(1).map(Number);}
async function screenshot(name:string,green:boolean,box:number[]){const child=Bun.spawn(adb('exec-out','screencap','-p'),{stdout:'pipe',stderr:'pipe'});const [status,bytes,err]=await Promise.all([child.exited,new Response(child.stdout).arrayBuffer(),new Response(child.stderr).text()]);assert.equal(status,0,err);const path=join(evidence,name+'.png');writeFileSync(path,new Uint8Array(bytes));const [left,top,right,bottom]=box;const result=await run([python,'-c','from PIL import Image; import sys; im=Image.open(sys.argv[1]).convert("RGB"); p=im.getpixel((int(sys.argv[2]),int(sys.argv[3]))); print(p); assert (p[1]>110 and p[0]<90) if sys.argv[4]=="green" else (p[0]>160 and p[1]<100)',path,String(Math.round(left+(right-left)*.15)),String(Math.round(top+(bottom-top)*.15)),green?'green':'red']);writeFileSync(join(evidence,name+'-pixels.txt'),result);}
const open=()=>run(adb('shell','am','start','-W','-n',bundle+'/'+activity));
try{
 const {old,next,point,publicKey,nextPublicKey}=await updateFixture(temp,'android',keyTransition);
 writeFileSync(join(temp,'next-publisher.key'),nextPublicKey);writeFileSync(join(evidence,'next-publisher.key'),nextPublicKey);
 for(const [name,bytes] of [['main.pocket',old.payload],['manifest.json',JSON.stringify(old.envelope)],['publisher.key',publicKey]] as const)writeFileSync(join(temp,name),bytes);
 for(const [name,bytes] of [['baseline.pocket',old.payload],['baseline-manifest.json',JSON.stringify(old.envelope)],['update.pocket',next.payload],['update-manifest.json',JSON.stringify(next.envelope)],['publisher.key',publicKey]] as const)writeFileSync(join(evidence,name),bytes);
 writeFileSync(join(temp,'tls.cnf'),'[req]\ndistinguished_name=dn\nprompt=no\nx509_extensions=v3\n[dn]\nCN=owned-update-test\n[v3]\nsubjectAltName=IP:127.0.0.1\nbasicConstraints=critical,CA:FALSE\nkeyUsage=critical,digitalSignature,keyEncipherment\nextendedKeyUsage=serverAuth\n');const cert=join(temp,'cert.pem'),key=join(temp,'key.pem');await run(['openssl','req','-x509','-newkey','rsa:2048','-nodes','-days','1','-keyout',key,'-out',cert,'-config',join(temp,'tls.cnf')]);await run(['openssl','x509','-in',cert,'-outform','DER','-out',join(temp,'cert.der')]);cpSync(cert,join(evidence,'server-cert.pem'));
 server=Bun.serve({hostname:'127.0.0.1',port:0,tls:{key:Bun.file(key),cert:Bun.file(cert)},fetch(request){const path=new URL(request.url).pathname;requests.push(path);const release=servePrevious?old:next;const base='https://127.0.0.1:'+server!.port;if(path==='/latest.json')return Response.json({appId:release.metadata.appId,version:release.metadata.version,manifestUrl:base+'/manifest.json',packageUrl:base+'/main.pocket'});if(path==='/manifest.json')return Response.json(release.envelope);if(path==='/main.pocket')return new Response(release.payload);return new Response(null,{status:404});}});
 await run(adb('reverse','tcp:'+server.port,'tcp:'+server.port));reversed=true;
 let nativeArchive=join(root,'core-ffi/target/aarch64-linux-android/release/libmini_core_ffi.a');
 if(guestTurnTracing){
  assert.ok(tracing,'Guest-turn tracing requires PJM_UPDATE_TRACE=1');
  const target=join(root,'core-ffi/target/android-turn-trace');
  const rustc=await run(['rustup','which','--toolchain','stable','rustc']);
  await run(['rustup','run','stable','cargo','build','--offline','--locked','--release','--features','android-turn-trace','--manifest-path',join(root,'core-ffi/Cargo.toml'),'--target','aarch64-linux-android','--target-dir',target],600000,{...process.env,RUSTC:rustc,CARGO_TARGET_AARCH64_LINUX_ANDROID_LINKER:join(ndk,'aarch64-linux-android23-clang'),CC_aarch64_linux_android:join(ndk,'aarch64-linux-android23-clang'),AR_aarch64_linux_android:join(ndk,'llvm-ar'),BINDGEN_EXTRA_CLANG_ARGS_aarch64_linux_android:'--target=aarch64-linux-android23 --sysroot='+join(ndk,'../sysroot'),LIBCLANG_PATH:'/Applications/Xcode.app/Contents/Developer/Toolchains/XcodeDefault.xctoolchain/usr/lib',RUSTFLAGS:'-C link-arg=-Wl,-z,max-page-size=16384'});
  nativeArchive=join(target,'aarch64-linux-android/release/libmini_core_ffi.a');
 }
 const library=join(temp,'libpocketjs.so');await run([join(ndk,'aarch64-linux-android23-clang'),'-Wall','-Wextra','-Werror','-fPIC','-shared','-Wl,--gc-sections','-Wl,--exclude-libs,ALL','-Wl,--no-undefined','-Wl,-z,max-page-size=16384','-I',join(root,'core-ffi/include'),...['package_bridge.c','pool_bridge.c','store_bridge.c'].map(name=>join(root,'host/android',name)),nativeArchive,...(guestTurnTracing?['-landroid']:[]),'-lEGL','-lGLESv2','-ldl','-lm','-llog','-o',library],120000);
 writeFileSync(join(evidence,'guest-turn-trace-build.json'),JSON.stringify({guestTurnTracing,nativeArchive,productionFeatureEnabled:false},null,2));
 await run([join(java,'bin/keytool'),'-genkeypair','-keystore',join(temp,'test.jks'),'-storepass','android','-keypass','android','-alias','test','-keyalg','RSA','-validity','1','-dname','CN=Temporary PocketJS Test']);
 async function installHost(name:string,current:boolean,previous:boolean,download:boolean){
 const project=join(temp,name);writeInstalledAndroidProject({directory:project,bundle,library,payload:join(temp,'main.pocket'),envelope:join(temp,'manifest.json'),publicKey:join(temp,current?'next-publisher.key':'publisher.key'),previousPublicKey:previous?join(temp,'publisher.key'):undefined,distributionUrl:download?'https://127.0.0.1:'+server!.port+'/latest.json':undefined});
 cpSync(join(temp,'cert.der'),join(project,'assets/tls-cert.der'));for(const file of ['UpdateSurfaceActivity.java','UpdateTLS.java'])cpSync(join(root,'tests',file),join(project,'src',file));
 for(const file of ['UpdateSurfaceActivity.java','UpdateTLS.java'])cpSync(join(project,'src',file),join(evidence,file));
 const sourcePath=join(project,'src/InstalledActivity.java'),source=readFileSync(sourcePath,'utf8'),factory='new PackageDownload(store,handler::post)';assert.equal(source.split(factory).length,2);writeFileSync(sourcePath,source.replace(factory,'new PackageDownload(store,handler::post,UpdateTLS.client(this))').replace('drawGpu(packed,hits,new byte[0]);',tracing?'android.os.Trace.beginSection("pjm-installed-update-frame");try{drawGpu(packed,hits,new byte[0]);}finally{android.os.Trace.endSection();}':'drawGpu(packed,hits,new byte[0]);'));cpSync(sourcePath,join(evidence,'installed-test-source.java'));
 const manifest=join(project,'AndroidManifest.xml');writeFileSync(manifest,readFileSync(manifest,'utf8').replace('</application>',tracing?'<profileable android:shell="true" /></application>':'</application>').replace('android:name="dev.pjm.android.InstalledActivity"','android:name="'+activity+'"'));
 writeFileSync(join(evidence,name+'-build.log'),await run(['bash',join(project,'build-apk.sh')],180000));await run([join(sdk,'build-tools/36.0.0/apksigner'),'sign','--ks',join(temp,'test.jks'),'--ks-pass','pass:android','--out',join(temp,'test.apk'),join(project,'build/Mini-unsigned.apk')]);await run(adb('install',...(installed?['-r']:[]),join(temp,'test.apk')));installed=true;
 }

 await installHost('host',false,false,!keyTransition);
 if(keyTransition){
  await open();const baseline=await proof('running=1.0.0 guest=1.0.0 count=0 current=1.0.0 pending=none','old-key-host');
  const surface=[...baseline.matchAll(/<node\b[^>]*>/g)].map(match=>match[0]).find(node=>node.includes('content-desc="signed='+old.metadata.appId+' version=1.0.0 frames='));assert.ok(surface);await screenshot('old-key-host',false,bounds(surface));
  await run(adb('shell','am','force-stop',bundle));
  writeFileSync(join(temp,'main.pocket'),next.payload);writeFileSync(join(temp,'manifest.json'),JSON.stringify(next.envelope));
  await installHost('overlap-host',true,true,true);
 }
 if(tracing){const config=join(evidence,'scheduler-trace.pbtxt');writeFileSync(config,`duration_ms: 900000
write_into_file: true
file_write_period_ms: 1000000000
buffers { size_kb: 32768 fill_policy: RING_BUFFER }
data_sources { config { name: "linux.ftrace" ftrace_config {
 buffer_size_kb: 4096
 drain_period_ms: 100
 ftrace_events: "sched/sched_switch"
 ftrace_events: "sched/sched_waking"
 ftrace_events: "sched/sched_blocked_reason"
 atrace_apps: "${bundle}"
} } }
data_sources { config { name: "linux.process_stats" process_stats_config { scan_all_processes_on_start: true proc_stats_poll_ms: 1000 } } }
`);await run(adb('push',config,traceConfigRemote));await run(adb('shell','perfetto','--txt','-c',traceConfigRemote,'--detach='+traceKey,'-o',traceRemote));traceStarted=true;await run(adb('shell','perfetto','--is_detached='+traceKey));}
 await open();const initial=await proof('running=1.0.0 guest=1.0.0 count=0 current=1.0.0 pending=2.0.0','staged-old-screen');const node=[...initial.matchAll(/<node\b[^>]*>/g)].map(match=>match[0]).find(node=>node.includes('content-desc="signed='+old.metadata.appId+' version=1.0.0 frames='));assert.ok(node);const box=bounds(node);await screenshot('staged-old-screen',false,box);
 const [left,top,right,bottom]=box,scale=Math.min((right-left)/360,(bottom-top)/598),x=left+((right-left)-360*scale)/2+point[0]*scale,y=top+((bottom-top)-598*scale)/2+point[1]*scale;await run(adb('shell','input','tap',String(Math.round(x)),String(Math.round(y))));await proof('running=1.0.0 guest=1.0.0 count=1 current=1.0.0 pending=2.0.0','incremented');for(let cycle=1;cycle<=lifecycleCycles;cycle++){await run(adb('shell','input','keyevent','KEYCODE_HOME'));await open();await proof('running=1.0.0 guest=1.0.0 count=1 current=1.0.0 pending=2.0.0','resume-'+cycle);writeFileSync(join(evidence,'lifecycle-progress.json'),JSON.stringify({completedCycles:cycle,requestedCycles:lifecycleCycles},null,2));}await proof('running=1.0.0 guest=1.0.0 count=1 current=1.0.0 pending=2.0.0','staged-retained-counter');await screenshot('staged-retained-counter',false,box);
 await run(adb('shell','am','force-stop',bundle));await open();const updated=await proof('running=2.0.0 guest=2.0.0 count=0 current=2.0.0 pending=2.0.0','cold-updated-screen');await screenshot('cold-updated-screen',true,box);
 const rollback=[...updated.matchAll(/<node\b[^>]*>/g)].map(match=>match[0]).find(node=>node.includes('content-desc="update-rollback"'));assert.ok(rollback);const [a,b,c,d]=bounds(rollback);await run(adb('shell','input','tap',String(Math.round((a+c)/2)),String(Math.round((b+d)/2))));await proof('running=2.0.0 guest=2.0.0 count=0 current=2.0.0 pending=1.0.0','rollback-pending');await run(adb('shell','am','force-stop',bundle));await open();await proof('running=1.0.0 guest=1.0.0 count=0 current=1.0.0 pending=2.0.0','cold-rollback-screen');await screenshot('cold-rollback-screen',false,box);
 if(keyTransition){
  // Rollback left old-key v1 active and new-key v2 pending. Promote v2 before
  // revoking v1; reinstall with the same APK signing key preserves the cache.
  await run(adb('shell','am','force-stop',bundle));await open();await proof('running=2.0.0 guest=2.0.0 count=0 current=2.0.0 pending=2.0.0','new-key-before-revocation');
  await run(adb('shell','am','force-stop',bundle));servePrevious=true;await run(adb('logcat','-c'));
  await installHost('revoked-host',true,false,true);await open();
  const revoked=await proof('running=2.0.0 guest=2.0.0 count=0 current=2.0.0 pending=none','revoked-old-key');await screenshot('revoked-old-key',true,box);
  const button=[...revoked.matchAll(/<node\b[^>]*>/g)].map(match=>match[0]).find(node=>node.includes('content-desc="update-rollback"'));assert.ok(button);const [a,b,c,d]=bounds(button);await run(adb('shell','input','tap',String(Math.round((a+c)/2)),String(Math.round((b+d)/2))));
  const deadline=Date.now()+30000;let rejected='';while(Date.now()<deadline){rejected=await xml();if(rejected.includes('content-desc="update-rollback-rejected-state-unchanged"'))break;await Bun.sleep(100);}assert.ok(rejected.includes('content-desc="update-rollback-rejected-state-unchanged"'));writeFileSync(join(evidence,'revoked-rollback-rejected.xml'),rejected);
  const downloadDeadline=Date.now()+30000;let downloadLog='';while(Date.now()<downloadDeadline){downloadLog=await run(adb('logcat','-d','-v','brief','PocketJS:W','*:S'));if(downloadLog.includes('Package update rejected'))break;await Bun.sleep(100);}assert.ok(downloadLog.includes('Package update rejected'),'Old-key HTTPS package must be rejected');writeFileSync(join(evidence,'revoked-download-rejected.log'),downloadLog);
  await run(adb('shell','am','force-stop',bundle));await open();await proof('running=2.0.0 guest=2.0.0 count=0 current=2.0.0 pending=none','revoked-cold-new-screen');await screenshot('revoked-cold-new-screen',true,box);
  const completed=Date.now()+30000;while(requests.filter(path=>path==='/main.pocket').length<6&&Date.now()<completed)await Bun.sleep(100);
  writeFileSync(join(evidence,'key-transition-result.json'),JSON.stringify({distinctPublisherKeys:!publicKey.equals(nextPublicKey),sameApkSigner:true,hostUpgradePreservedOldCache:true,overlapHttpsStaging:true,overlapColdPromotionAndRollbackPixels:true,oldKeyRevokedByHostUpgrade:true,oldKeyRollbackRejectedWithoutStateMutation:true,oldKeyHttpsStageRejected:true,newKeyColdPixelsAfterRevocation:true,physicalAcceptance:false},null,2));
 }
 assert.equal(requests.filter(path=>path==='/main.pocket').length,keyTransition?6:3);writeFileSync(join(evidence,'result.json'),JSON.stringify({exitCode:0,realTsx:true,productionInstalledActivity:true,testOnlyCertificateClient:true,testOnlyReadOnlyObserverAndRollbackButton:true,actualHttpsDownloads:requests.filter(path=>path==='/main.pocket').length,publisherKeyTransition:keyTransition,runningOldScreenAndCounterRetained:true,backgroundResume:true,lifecycleCycles,coldUpdatedScreenAndPixels:true,coldRollbackScreenAndPixels:true,physicalAcceptance:false},null,2));console.log('Installed Android TSX HTTPS update, retained counter, cold new pixels and rollback pixels passed.');
}finally{
 if(traceStarted){const receipt:{key:string,stopConfirmed:boolean,bytes:number,error?:string}={key:traceKey,stopConfirmed:false,bytes:0};try{await run(adb('shell','perfetto','--attach='+traceKey,'--stop'));receipt.stopConfirmed=true;const target=join(evidence,'scheduler.perfetto-trace');await run(adb('pull',traceRemote,target));receipt.bytes=statSync(target).size;assert.ok(receipt.bytes>0);}catch(error){receipt.error=String(error);}writeFileSync(join(evidence,'scheduler-trace-result.json'),JSON.stringify(receipt,null,2));await run(adb('shell','rm','-f',traceRemote,traceConfigRemote)).catch(()=>{});}
 if(installed){await run(adb('shell','am','force-stop',bundle)).catch(()=>{});await run(adb('uninstall',bundle)).catch(()=>{});}if(reversed && server)await run(adb('reverse','--remove','tcp:'+server.port)).catch(()=>{});await run(adb('shell','rm','-f',xmlPath)).catch(()=>{});writeFileSync(join(evidence,'native-errors.log'),await run(adb('logcat','-d','-v','brief','PocketJS:E','AndroidRuntime:E','*:S')).catch(()=>''));server?.stop(true);rmSync(temp,{recursive:true,force:true});writeFileSync(join(evidence,'requests-and-cleanup.json'),JSON.stringify({requests,serverStopped:true,testPrivateKeyRemoved:true,testApkKeyRemoved:true,productionTrustChanged:false},null,2));writeFileSync(join(evidence,'commands.log'),log);
}
