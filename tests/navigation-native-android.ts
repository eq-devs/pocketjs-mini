import {developmentExitSource} from './development-exit-fixture.ts';
import {developmentMediaSource} from './development-media-fixture.ts';
import {developmentLocationSource} from './development-location-fixture.ts';
import {developmentHttpMediaSource} from './development-http-media-fixture.ts';
import {developmentHttpSource} from './development-http-fixture.ts';
import {mkdirSync,mkdtempSync,readFileSync,writeFileSync,symlinkSync,rmSync,existsSync,lstatSync,readdirSync,realpathSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import assert from 'node:assert/strict';
import {developmentClipboardReadSource} from './development-clipboard-read-fixture.ts';
import {androidSdk} from '../bin/android.ts';
import {developmentNetworkSource,developmentNetworkProof} from './development-network-fixture.ts';

const fixtureRoot=resolve(import.meta.dir,'..'),freshNativeSdk=process.env.PJM_FRESH_NATIVE_SDK;
const root=freshNativeSdk?resolve(freshNativeSdk):fixtureRoot,serial=Bun.argv[2];
if(!serial || !/^[a-zA-Z0-9_.:-]+$/.test(serial))throw Error('Usage: bun tests/navigation-native-android.ts <adb serial>');
const temp=mkdtempSync(join(tmpdir(),'pjm-navigation-android-')),project=join(temp,'navigation');
const evidence=resolve(process.env.PJM_NAVIGATION_EVIDENCE??join(root,'build/android-validation/navigation-'+Date.now()));
mkdirSync(evidence,{recursive:true});
const env={...process.env,PJM_RECORD:'0',PJM_INSPECT:'1',PJM_ANDROID_TEST:'1'};
const readMode=process.env.PJM_DEVELOPMENT_CLIPBOARD_READ;assert.ok(!readMode||['allow','deny','undeclared'].includes(readMode));
const expectedRead=readMode==='allow'?'SUCCESS':'DENIED';
const locationMode=process.env.PJM_DEVELOPMENT_LOCATION;assert.ok(!locationMode||['undeclared','deny','allow'].includes(locationMode));
const httpMode=process.env.PJM_DEVELOPMENT_HTTP==='1';
const mixedMode=process.env.PJM_DEVELOPMENT_HTTP_MEDIA==='1';
const mediaMode=process.env.PJM_DEVELOPMENT_MEDIA;assert.ok(!mediaMode||['undeclared','deny','library','cancel','camera-cancel','camera'].includes(mediaMode));assert.ok(!mediaMode||(!readMode&&!locationMode&&(!httpMode||mixedMode)&&process.env.PJM_DEVELOPMENT_NETWORK==='1'));
assert.ok(!mixedMode||(httpMode&&mediaMode==='camera'));
const networkMode=process.env.PJM_DEVELOPMENT_NETWORK==='1';
const exitMode=process.env.PJM_DEVELOPMENT_EXIT==='1';assert.ok(!exitMode||(!networkMode&&!readMode&&!locationMode&&!mediaMode&&!httpMode&&!mixedMode),'Choose exit or service acceptance');
const adb=(...args:string[])=>[join(androidSdk(),'platform-tools/adb'),'-s',serial,...args];
let host:ReturnType<typeof Bun.spawn>|undefined;
let logging:Promise<unknown>|undefined;
let activeSession:string|undefined,lastHealthCheck=0,firstPermissionRequestTimedOut=false;
let restoreConnectivity:(()=>Promise<void>)|undefined;
class UnexpectedCameraActivity extends Error {}
const log=Bun.file(join(evidence,'server.log')).writer();
async function run(args:string[],cwd=temp){
 const child=Bun.spawn(args,{cwd,env,stdout:'pipe',stderr:'pipe'});const timer=setTimeout(()=>child.kill(),30000);
 try{const [status,out,err]=await Promise.all([child.exited,new Response(child.stdout).text(),new Response(child.stderr).text()]);assert.equal(status,0,args[0]+': '+err);return out.trim();}finally{clearTimeout(timer);}
}
async function hierarchy(path:string){
 await run(adb('shell','rm','-f',path));
 const output=await run(adb('shell','uiautomator','dump',path));
 assert.match(output,/UI hier(?:archy|chary) dumped to:/,'UI dump failed: '+output);
 const value=await run(adb('shell','cat',path));assert.ok(value.includes('<hierarchy'),'Missing fresh UI hierarchy');return value;
}
async function wait<T>(read:()=>Promise<T>,accept:(value:T)=>boolean){
 const deadline=Date.now()+300000;let last:unknown;
 while(Date.now()<deadline){if(host?.exitCode!==null && host?.exitCode!==undefined)throw Error('Native launcher stopped; inspect '+join(evidence,'server.log'));
  if(activeSession && Date.now()-lastHealthCheck>=1000){lastHealthCheck=Date.now();const current=await run(adb('shell','run-as','dev.pjm.android','cat','files/pjm-receipt.json')).then(value=>JSON.parse(value)).catch(()=>undefined);const report=await run(adb('shell','run-as','dev.pjm.android','cat','files/pjm-status.json')).then(value=>JSON.parse(value)).catch(()=>undefined);const status=report?.session===activeSession?report.message:current?.session===activeSession?await run(adb('shell','run-as','dev.pjm.android','cat','files/pjm-status.txt')).catch(()=>''):'';if(/^(Frame|Boot|Resume|Hide|Shutdown|Memory warning) revision=\d+: |Guest (turn|job) deadline exceeded|Guest has unhandled Promise rejection|\(deadline budget=/.test(status)){writeFileSync(join(evidence,'guest-failure.json'),JSON.stringify({status,receipt:current??null,report:report??null},null,2));throw Error('Native guest failed: '+status);}if(mixedMode){const inspection=await fetch(activeSession+'inspection').then(response=>response.ok?response.json():undefined).catch(()=>undefined);const mixedText=inspection?.tree?.nodes?.map((node:any)=>node.text).join('')??'';if(mixedText.includes('Mixed: FAILED ')){writeFileSync(join(evidence,'mixed-failure.json'),JSON.stringify(inspection));throw Error('Mixed HTTP/media SDK failed: '+mixedText);}}}
  try{const value=await read();if(accept(value))return value;last=value;}catch(error){if(error instanceof UnexpectedCameraActivity)throw error;last=String(error);}await Bun.sleep(250);
 }throw Error('Navigation timeout: '+JSON.stringify(last));
}
async function screenshot(name:string){
 const child=Bun.spawn(adb('exec-out','screencap','-p'),{stdout:'pipe',stderr:'pipe'});const timer=setTimeout(()=>child.kill(),30000);
 try{const [status,bytes,error]=await Promise.all([child.exited,new Response(child.stdout).arrayBuffer(),new Response(child.stderr).text()]);assert.equal(status,0,error);writeFileSync(join(evidence,name),new Uint8Array(bytes));}finally{clearTimeout(timer);}
}
try{
 await wait(()=>run(adb('shell','getprop','sys.boot_completed')),value=>value==='1');
 if(freshNativeSdk)assert.ok(!existsSync(join(root,'examples'))&&!existsSync(join(root,'.pjm'))&&!existsSync(join(root,'core-ffi/target')),'Fresh SDK must have no example or native caches');
 await run([join(root,'bin/pjm'),'create','navigation']);
 if(!freshNativeSdk){mkdirSync(join(project,'.pjm'));symlinkSync(join(root,'examples/hello/.pjm/pocketjs'),join(project,'.pjm/pocketjs'));}
 else assert.ok(!existsSync(join(project,'.pjm')),'Fresh project cache must be empty');
 for(const name of ['mini.json','app/main.tsx'])writeFileSync(join(project,name),readFileSync(join(fixtureRoot,'examples/navigation',name)));
 const navigationSource=readFileSync(join(project,'app/main.tsx'),'utf8');if(mixedMode){const config=JSON.parse(readFileSync(join(project,'mini.json'),'utf8'));config.permissions=['media'];config.domains=['example.com'];writeFileSync(join(project,'mini.json'),JSON.stringify(config));writeFileSync(join(project,'app/main.tsx'),developmentHttpMediaSource(navigationSource));}else if(mediaMode){const config=JSON.parse(readFileSync(join(project,'mini.json'),'utf8'));config.permissions=mediaMode==='undeclared'?[]:['media'];writeFileSync(join(project,'mini.json'),JSON.stringify(config));writeFileSync(join(project,'app/main.tsx'),developmentMediaSource(navigationSource,'initial',(mediaMode==='camera-cancel'||mediaMode==='camera')?'camera':'library'));}else if(readMode){const config=JSON.parse(readFileSync(join(project,'mini.json'),'utf8'));config.permissions=readMode==='undeclared'?[]:['clipboard.read'];writeFileSync(join(project,'mini.json'),JSON.stringify(config));writeFileSync(join(project,'app/main.tsx'),developmentClipboardReadSource(navigationSource));}else if(locationMode){const config=JSON.parse(readFileSync(join(project,'mini.json'),'utf8'));config.permissions=locationMode==='undeclared'?[]:['location'];writeFileSync(join(project,'mini.json'),JSON.stringify(config));writeFileSync(join(project,'app/main.tsx'),developmentLocationSource(navigationSource,'initial',locationMode==='allow'));}else if(httpMode){const config=JSON.parse(readFileSync(join(project,'mini.json'),'utf8'));config.domains=['example.com'];writeFileSync(join(project,'mini.json'),JSON.stringify(config));writeFileSync(join(project,'app/main.tsx'),developmentHttpSource(navigationSource));}else if(networkMode)writeFileSync(join(project,'app/main.tsx'),developmentNetworkSource(navigationSource));
 host=Bun.spawn([join(root,'bin/pjm'),'run','--device','android','-d',serial],{cwd:project,env,stdout:'pipe',stderr:'pipe'});
 const copy=async(stream:ReadableStream<Uint8Array>)=>{for await(const bytes of stream){log.write(bytes);await log.flush();}};logging=Promise.all([copy(host.stdout),copy(host.stderr)]);
 const session=await wait(async()=>JSON.parse(readFileSync(join(project,'build/session.json'),'utf8')),value=>!!value.url);
 activeSession=session.url;
 const receipt=async()=>JSON.parse(await run(adb('shell','run-as','dev.pjm.android','cat','files/pjm-receipt.json')));
 const snapshot=async()=>{const response=await fetch(session.url+'inspection');assert.ok(response.ok);return response.json() as Promise<any>;};
 const text=(value:any)=>value.tree.nodes.map((node:any)=>node.text).join('');
 let mixedRunToken:string|undefined;
 const freshMixed=(value:any)=>{if(!mixedMode)return true;const token=text(value).match(/Mixed run: ([a-z0-9]+)/)?.[1];return !!token&&token!==mixedRunToken;};
 async function networkProof(name:string,accept:(proof:NonNullable<ReturnType<typeof developmentNetworkProof>>)=>boolean){const value=await wait(snapshot,value=>{const proof=developmentNetworkProof(text(value));return !!proof&&accept(proof);});writeFileSync(join(evidence,name+'.json'),JSON.stringify(value));return developmentNetworkProof(text(value))!;}
 async function mediaProof(name:string){const value=await wait(snapshot,value=>freshMixed(value)&&/Media: (DENIED|SUCCESS|CANCELLED|TIMEOUT|FAILED|BUSY)/.test(text(value)));writeFileSync(join(evidence,name+'.json'),JSON.stringify(value));const expected=mediaMode==='library'?'Media: SUCCESS JPEG 64x32 released=DENIED':(mediaMode==='cancel'||mediaMode==='camera-cancel')?'Media: CANCELLED':'Media: DENIED';if(mediaMode==='camera')assert.match(text(value),/Media: SUCCESS JPEG \d+x\d+ released=DENIED/,'Camera SDK failed: '+text(value));else assert.ok(text(value).includes(expected),'Media SDK failed: '+text(value));}
 async function locationProof(name:string){const value=await wait(snapshot,value=>/Location: (DENIED|SUCCESS|TIMEOUT|FAILED|BUSY)/.test(text(value)));writeFileSync(join(evidence,name+'.json'),JSON.stringify(value));if(locationMode==='allow'&&!text(value).includes('Location: SUCCESS')){writeFileSync(join(evidence,'location-provider-state.txt'),await run(adb('shell','dumpsys','location')));writeFileSync(join(evidence,'location-package-state.txt'),await run(adb('shell','dumpsys','package','dev.pjm.android')));writeFileSync(join(evidence,'location-consent-state.xml'),await run(adb('shell','run-as','dev.pjm.android','cat','shared_prefs/pjm-development-location-consent.xml')).catch(()=>''));}if(locationMode==='allow'){const match=text(value).match(/Location: SUCCESS (-?[0-9.]+),(-?[0-9.]+)/);assert.ok(match,'Location provider did not succeed: '+text(value));assert.ok(Math.abs(Number(match[1])-43.238949)<0.0001 && Math.abs(Number(match[2])-76.889709)<0.0001,'Wrong OS provider coordinates');}else assert.ok(text(value).includes('Location: DENIED'));}
 async function httpProof(name:string){const value=await wait(snapshot,value=>text(value).includes('HTTP: FAILED ')||/HTTP: SUCCESS bytes=\d+ domain=DENIED released=DENIED/.test(text(value)));writeFileSync(join(evidence,name+'.json'),JSON.stringify(value));assert.match(text(value),/HTTP: SUCCESS bytes=\d+ domain=DENIED released=DENIED/,'Live HTTP SDK failed');}
 async function mixedProof(name:string){const expected='Mixed: SUCCESS held=3+1 quota=BUSY reused=1 refilled=4 released=DENIED';const value=await wait(snapshot,value=>freshMixed(value)&&(text(value).includes(expected)||text(value).includes('Mixed: FAILED ')));writeFileSync(join(evidence,name+'.json'),JSON.stringify(value));assert.ok(text(value).includes(expected),'Shared HTTP/media quota failed: '+text(value));mixedRunToken=text(value).match(/Mixed run: ([a-z0-9]+)/)![1];}
 async function page(label:string,counter:number){
  const value=await wait(snapshot,value=>text(value).includes(label) && new RegExp('(Home|Saved) counter: '+counter).test(text(value)));
  const state=await(await fetch(session.url+'state')).json();assert.equal(value.revision,state.revision);assert.equal(value.platform,'android');
  return value;
 }
 async function tap(label:string){
  const tree=await snapshot(),marker=tree.tree.nodes.find((node:any)=>node.text===label);assert.ok(marker,'Missing button '+label);
  const bounds=tree.tree.nodes.find((node:any)=>node.id===marker.parent)?.bounds;assert.ok(bounds,'Missing button bounds '+label);
  const value=await receipt();assert.equal(value.session,session.url);assert.equal(value.revision,tree.revision);
  await run(adb('shell','input','tap',String(Math.round((value.left+bounds[0]+bounds[2]/2)*value.density)),String(Math.round((value.top+bounds[1]+bounds[3]/2)*value.density))));
 }
 if(mediaMode&&mediaMode!=='undeclared'){
  const promptPath='/data/local/tmp/'+temp.split('/').pop()+'-media.xml';
  try{const xml=await wait(()=>hierarchy(promptPath),value=>value.includes('Image access'));writeFileSync(join(evidence,'media-consent.xml'),xml);const node=xml.match(new RegExp('<node[^>]*resource-id="android:id/'+(mediaMode==='deny'?'button2':'button1')+'"[^>]*>'))?.[0];assert.ok(node);const bounds=node.match(/bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/);assert.ok(bounds);await run(adb('shell','input','tap',String(Math.round((Number(bounds[1])+Number(bounds[3]))/2)),String(Math.round((Number(bounds[2])+Number(bounds[4]))/2))));}finally{await run(adb('shell','rm','-f',promptPath)).catch(()=>{});}
 }
 async function mediaPicker(stage:string){
  if(mediaMode!=='library'&&mediaMode!=='cancel'&&mediaMode!=='camera-cancel'&&mediaMode!=='camera')return;
  const path='/data/local/tmp/'+temp.split('/').pop()+'-picker.xml';
  const xml=()=>hierarchy(path);
  let shutterTapped=false;
  async function cameraHierarchy(){
   const value=await xml(),windows=await run(adb('shell','dumpsys','window'));
   const focus=windows.split('\n').filter(line=>/mCurrentFocus=|mFocusedApp=/.test(line)).join('\n');
   writeFileSync(join(evidence,stage+'-camera-focus.txt'),focus);
   const clipboard=windows.split(/\n\s*Window #\d+ /).filter(block=>block.split('\n')[0].includes('ClipboardOverlay')&&/isVisible=true|isOnScreen=true/.test(block));
   if(clipboard.length){writeFileSync(join(evidence,stage+'-clipboard-overlay.txt'),clipboard.join('\n'));assert.fail('Clipboard preview still covers camera controls');}
   if(shutterTapped&&/mCurrentFocus=/.test(focus)&&! /mCurrentFocus=.*com\.android\.camera(?:2)?\//.test(focus)){
    writeFileSync(join(evidence,stage+'-unexpected-camera-windows.txt'),windows);
    const events=await run(adb('logcat','-d','-v','threadtime','ActivityTaskManager:I','ActivityManager:I','*:S'));
    writeFileSync(join(evidence,stage+'-activity-events.log'),events.split('\n').filter(line=>/camera(?:2)?|dev\.pjm\.android|nearby\.sharing|nexuslauncher/.test(line)).join('\n'));
    throw new UnexpectedCameraActivity('Camera lost focus after shutter: '+focus);
   }
   assert.match(focus,/mCurrentFocus=.*com\.android\.camera(?:2)?\//,'Camera does not own input focus: '+focus);
   return value;
  }
  async function tapNode(value:string,select:(node:string)=>boolean){const node=[...value.matchAll(/<node\b[^>]*>/g)].map(m=>m[0]).find(select);assert.ok(node,'Missing picker control');const b=node.match(/bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/);assert.ok(b);await run(adb('shell','input','tap',String(Math.round((Number(b[1])+Number(b[3]))/2)),String(Math.round((Number(b[2])+Number(b[4]))/2))));}
  async function captureFiles(){const value=await run(adb('exec-out','run-as','dev.pjm.android','ls','-a','cache/pjm-media-camera'));return value.split(/\r?\n/).filter(name=>name&&name!=='.'&&name!=='..').sort().join('\n');}
  try{
   if(mediaMode==='camera-cancel'||mediaMode==='camera'){
    const camera=await wait(cameraHierarchy,v=>/package="com\.android\.camera(?:2)?"/.test(v)&&/shutter|Shutter|Capture|Take photo/.test(v));
    writeFileSync(join(evidence,stage+'-camera.xml'),camera);await screenshot(stage+'-camera.png');
    const pending=await captureFiles();assert.match(pending,/capture-.*\.jpg/,'Missing private capture file');
    writeFileSync(join(evidence,stage+'-capture-pending.txt'),pending);
    assert.match(pending,/^capture-[^\n]+\.jpg$/,'Expected one pending capture file');
    const uriGrants=async()=>{const value=await run(adb('shell','dumpsys','activity','-a','permissions'));assert.match(value,/ACTIVITY MANAGER URI PERMISSIONS/,'URI grant service did not produce a valid report');return value;};
    const granted=await uriGrants();writeFileSync(join(evidence,stage+'-uri-grants-active.txt'),granted);
    const captureUri='content://dev.pjm.android.pjm.media/capture/'+pending;
    const grant=granted.split('UriPermission{').find(block=>block.includes(captureUri));assert.ok(grant,'Camera capture URI grant missing');
    assert.match(grant,/sourcePkg=dev\.pjm\.android targetPkg=com\.android\.camera(?:2)?(?:\s|$)/,'Wrong capture grant recipient');
    assert.match(grant,/mode=0x3 owned=0x3 global=0x0 persistable=0x0 persisted=0x0/,'Capture permission must be transient read/write access');
    if(mediaMode==='camera-cancel')await run(adb('shell','input','keyevent','KEYCODE_BACK'));
    else{
     const ready=await wait(cameraHierarchy,v=>/resource-id="com\.android\.camera(?:2)?:id\/shutter_button"/.test(v));
     writeFileSync(join(evidence,stage+'-shutter-action.json'),JSON.stringify({time:Date.now(),focus:(await run(adb('shell','dumpsys','window'))).split('\n').filter(line=>/mCurrentFocus=|mFocusedApp=/.test(line)),nativeHierarchy:ready}));
     await tapNode(ready,n=>/resource-id="com\.android\.camera(?:2)?:id\/shutter_button"/.test(n)&&n.includes('enabled="true"'));
     shutterTapped=true;
     const review=await wait(cameraHierarchy,v=>/resource-id="com\.android\.camera(?:2)?:id\/(done_button|review_done|btn_done)"/.test(v)||v.includes('content-desc="Done"'));
     writeFileSync(join(evidence,stage+'-camera-review.xml'),review);await screenshot(stage+'-camera-review.png');
     const confirmed=await wait(cameraHierarchy,v=>/resource-id="com\.android\.camera(?:2)?:id\/(done_button|review_done|btn_done)"/.test(v)||v.includes('content-desc="Done"'));
     await tapNode(confirmed,n=>/resource-id="com\.android\.camera(?:2)?:id\/(done_button|review_done|btn_done)"/.test(n)||n.includes('content-desc="Done"'));
    }
    await mediaProof(stage);
    await wait(captureFiles,value=>value==='');
    const revoked=await wait(uriGrants,value=>!value.includes(pending));
    writeFileSync(join(evidence,stage+'-uri-grants-revoked.txt'),revoked);
    writeFileSync(join(evidence,stage+'-capture-cleaned.json'),JSON.stringify({privateCaptureFiles:0,captureUriGrantRemoved:true}));return;
   }
   let picker=await wait(xml,v=>v.includes('package="com.google.android.documentsui"')||v.includes('package="com.android.documentsui"'));writeFileSync(join(evidence,stage+'-picker.xml'),picker);
   if(mediaMode==='cancel'){await run(adb('shell','input','keyevent','KEYCODE_BACK'));return;}
   const name=process.env.PJM_MEDIA_LIBRARY_NAME;assert.ok(name&&/^pjm-owned-[a-zA-Z0-9-]+\.png$/.test(name),'Owned image name required');
   const owns=(node:string)=>node.includes('text="'+name+'"')||node.includes('content-desc="'+name+',');
   if(!owns(picker)){await tapNode(picker,n=>/content-desc="(?:Show roots|Show navigation drawer)"/.test(n));const roots=await wait(xml,v=>v.includes('text="Downloads"'));await tapNode(roots,n=>n.includes('text="Downloads"'));picker=await wait(xml,owns);}
   writeFileSync(join(evidence,stage+'-owned-image.xml'),picker);await screenshot(stage+'-picker.png');await tapNode(picker,owns);
  }finally{await run(adb('shell','rm','-f',path)).catch(()=>{});}
 }
 await mediaPicker('media-initial');
 if(mediaMode)await mediaProof('media-initial');
 if(readMode && readMode!=='undeclared'){
  const promptPath='/data/local/tmp/'+temp.split('/').pop()+'-clipboard.xml';
  try{const xml=await wait(()=>hierarchy(promptPath),value=>value.includes('Clipboard access'));
   writeFileSync(join(evidence,'clipboard-consent.xml'),xml);const button=readMode==='allow'?'button1':'button2';const node=xml.match(new RegExp('<node[^>]*resource-id="android:id/'+button+'"[^>]*>'))?.[0];assert.ok(node,'Native consent button missing');const bounds=node.match(/bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/);assert.ok(bounds);await run(adb('shell','input','tap',String(Math.round((Number(bounds[1])+Number(bounds[3]))/2)),String(Math.round((Number(bounds[2])+Number(bounds[4]))/2))));
  }finally{await run(adb('shell','rm','-f',promptPath)).catch(()=>{});}
 }
 if(locationMode==='deny'||locationMode==='allow'){
  const promptPath='/data/local/tmp/'+temp.split('/').pop()+'-location.xml';
  async function dialog(){return hierarchy(promptPath);}
  async function tapDialog(xml:string,id:string){const node=xml.match(new RegExp('<node[^>]*resource-id="'+id+'"[^>]*>'))?.[0];assert.ok(node,'Native location button missing '+id);const bounds=node.match(/bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/);assert.ok(bounds);await run(adb('shell','input','tap',String(Math.round((Number(bounds[1])+Number(bounds[3]))/2)),String(Math.round((Number(bounds[2])+Number(bounds[4]))/2))));}
  try{const xml=await wait(dialog,value=>value.includes('Location access'));writeFileSync(join(evidence,'location-consent.xml'),xml);await tapDialog(xml,'android:id/'+(locationMode==='allow'?'button1':'button2'));
   if(locationMode==='allow'){const os=await wait(dialog,value=>/permission_allow_(foreground_only_)?button/.test(value));writeFileSync(join(evidence,'location-os-permission.xml'),os);const precise=os.match(/resource-id="([^"]*:id\/permission_location_accuracy_radio_fine)"/)?.[1];if(precise)await tapDialog(os,precise);await tapDialog(await dialog(),os.match(/resource-id="([^"]*:id\/permission_allow_(?:foreground_only_)?button)"/)![1]);}
  }finally{await run(adb('shell','rm','-f',promptPath)).catch(()=>{});}
 }
 if(locationMode==='allow'){
  const first=await wait(snapshot,value=>/Location: (SUCCESS|TIMEOUT|FAILED|DENIED|BUSY)/.test(text(value)));
  if(text(first).includes('Location: TIMEOUT')){firstPermissionRequestTimedOut=true;writeFileSync(join(evidence,'location-permission-timeout.json'),JSON.stringify(first));writeFileSync(join(project,'app/main.tsx'),readFileSync(join(project,'app/main.tsx'),'utf8')+'\n// Fresh SDK request after native permission approval.\n');await wait(snapshot,value=>value.revision>first.revision);}
 }
 if(locationMode)await locationProof('location-initial');
 if(readMode){const proof=await wait(snapshot,value=>text(value).includes('Clipboard read: '+expectedRead));writeFileSync(join(evidence,'clipboard-read-initial.json'),JSON.stringify(proof));}
 if(httpMode)await httpProof('http-initial');
 if(mixedMode)await mixedProof('mixed-initial');
 await wait(receipt,value=>value.session===session.url && value.frames>=30);
 writeFileSync(join(evidence,'home.json'),JSON.stringify(await page('Home page',0)));await screenshot('home.png');
 if(networkMode){
  assert.ok(serial.startsWith('emulator-'),'Network transitions require an owned emulator');
  const initial=await networkProof('network-initial',proof=>!['unknown','none'].includes(proof.type));
  const wifi=await run(adb('shell','settings','get','global','wifi_on')),data=await run(adb('shell','settings','get','global','mobile_data'));assert.ok(['0','1'].includes(wifi)&&['0','1'].includes(data),'Cannot restore emulator connectivity');
  restoreConnectivity=async()=>{await run(adb('shell','svc','wifi',wifi==='1'?'enable':'disable'));await run(adb('shell','svc','data',data==='1'?'enable':'disable'));};
  await run(adb('shell','svc','wifi','disable'));await run(adb('shell','svc','data','disable'));
  const offline=await networkProof('network-offline',proof=>proof.type==='none'&&proof.events>initial.events);
  await restoreConnectivity();await networkProof('network-restored',proof=>!['unknown','none'].includes(proof.type)&&proof.events>offline.events);
 }
 await tap('Increment counter');await page('Home page',1);
 await tap('Open detail');const detail=await page('Detail page',1);assert.match(text(detail),/Selected item: 42/);
 writeFileSync(join(evidence,'detail.json'),JSON.stringify(detail));await screenshot('detail.png');
 await tap('Back to home');await page('Home page',1);
 await tap('Open detail');await page('Detail page',1);
 await run(adb('shell','input','keyevent','KEYCODE_HOME'));await Bun.sleep(500);
 const open=()=>run(adb('shell','am','start','-W','-f','0x00020000','-n','dev.pjm.android/.MiniActivity','--es','pjm-url',session.url,'--ez','pjm-test','true','--ez','pjm-inspect','true'));
 await open();await page('Detail page',1);
 if(networkMode)await networkProof('network-resumed',proof=>!['unknown','none'].includes(proof.type));
 await run(adb('shell','run-as','dev.pjm.android','rm','-f','files/pjm-back.txt'));
 await run(adb('shell','input','keyevent','KEYCODE_BACK'));
 const backReceipt=await wait(()=>run(adb('shell','run-as','dev.pjm.android','cat','files/pjm-back.txt')),value=>value.length>0);
 writeFileSync(join(evidence,'system-back.txt'),backReceipt);assert.match(backReceipt,/^handled=1 revision=/,'Detail system Back failed: '+backReceipt);
 writeFileSync(join(evidence,'back-home.json'),JSON.stringify(await page('Home page',1)));await screenshot('back-home.png');
 await run(adb('shell','input','keyevent','KEYCODE_BACK'));
 const xmlPath='/data/local/tmp/'+temp.split('/').pop()+'.xml';
 const exit=await wait(()=>hierarchy(xmlPath),value=>!value.includes('package="dev.pjm.android"'));
 writeFileSync(join(evidence,'back-exit.xml'),exit);await run(adb('shell','rm','-f',xmlPath));
 await open();await mediaPicker('media-cold');await wait(receipt,value=>value.session===session.url && value.frames>=30);
 const cold=await page('Home page',0);writeFileSync(join(evidence,'cold-home.json'),JSON.stringify(cold));await screenshot('cold-home.png');
 if(readMode){const proof=await wait(snapshot,value=>text(value).includes('Clipboard read: '+expectedRead));writeFileSync(join(evidence,'clipboard-read-cold.json'),JSON.stringify(proof));}
 if(mediaMode)await mediaProof('media-cold');
 if(locationMode)await locationProof('location-cold');
 if(httpMode)await httpProof('http-cold');
 if(mixedMode)await mixedProof('mixed-cold');
 if(networkMode){
  await networkProof('network-cold',proof=>proof.fixture==='initial'&&!['unknown','none'].includes(proof.type));
  const before=(await snapshot()).revision;writeFileSync(join(project,'app/main.tsx'),mixedMode?developmentHttpMediaSource(navigationSource,'reloaded'):mediaMode?developmentMediaSource(navigationSource,'reloaded',(mediaMode==='camera-cancel'||mediaMode==='camera')?'camera':'library'):readMode?developmentClipboardReadSource(navigationSource,'reloaded'):httpMode?developmentHttpSource(navigationSource,'reloaded'):locationMode?developmentLocationSource(navigationSource,'reloaded',locationMode==='allow'):developmentNetworkSource(navigationSource,'reloaded'));
  await mediaPicker('media-hot-reload');
  await wait(snapshot,value=>value.revision>before&&developmentNetworkProof(text(value))?.fixture==='reloaded');
  await networkProof('network-hot-reload',proof=>proof.fixture==='reloaded'&&!['unknown','none'].includes(proof.type)&&proof.events===0);await page('Home page',0);await screenshot('hot-reload.png');if(readMode){const proof=await wait(snapshot,value=>text(value).includes('Clipboard read: '+expectedRead));writeFileSync(join(evidence,'clipboard-read-hot-reload.json'),JSON.stringify(proof));}if(httpMode){await httpProof('http-hot-reload');await screenshot('http-hot-reload.png');}if(mediaMode){await mediaProof('media-hot-reload');await screenshot('media-hot-reload.png');}if(locationMode){await locationProof('location-hot-reload');await screenshot('location-hot-reload.png');}if(mixedMode)await mixedProof('mixed-hot-reload');
 }
 if(exitMode){
  const state=async()=>{const response=await fetch(session.url+'state');assert.ok(response.ok);return response.json() as Promise<any>;};
  const before=await state();writeFileSync(join(project,'app/main.tsx'),developmentExitSource(navigationSource));
  const ready=await wait(state,value=>value.revision>before.revision&&!value.error);
  const closed=await wait(()=>hierarchy(xmlPath),value=>!value.includes('package="dev.pjm.android"'));writeFileSync(join(evidence,'guest-exit.xml'),closed);
  const stored=JSON.parse(await run(adb('shell','run-as','dev.pjm.android','cat','files/mini-data/dev.pjm.navigation/storage.json')));assert.equal(stored['dev-exit-proof'],'saved');
  writeFileSync(join(evidence,'exit-storage-proof.json'),JSON.stringify({unloadSaved:true}));
  writeFileSync(join(project,'app/main.tsx'),navigationSource.replace('Home page','Home after closed edit'));
  const changed=await wait(state,value=>value.revision>ready.revision&&!value.error);writeFileSync(join(evidence,'exit-post-close-edit.json'),JSON.stringify(changed));
  const until=Date.now()+3000;let samples=0;
  while(Date.now()<until){const value=await hierarchy(xmlPath);assert.ok(!value.includes('package="dev.pjm.android"'),'Source edit reopened closed guest');samples++;await Bun.sleep(250);}
  await screenshot('guest-exit-still-closed.png');await open();await wait(receipt,value=>value.session===session.url&&value.frames>=30);await page('Home after closed edit',0);await screenshot('guest-exit-explicit-cold.png');
  writeFileSync(join(evidence,'exit-proof.json'),JSON.stringify({closedAfterEdit:true,observationMs:3000,samples,explicitColdReopen:true,unloadSaved:true}));await run(adb('shell','rm','-f',xmlPath));
 }
 writeFileSync(join(evidence,'navigation.pocket'),readFileSync(join(project,'build/navigation.pocket')));
 if(freshNativeSdk){
  assert.ok(!existsSync(join(root,'examples'))&&!existsSync(join(root,'.pjm/pocketjs')));
  assert.ok(lstatSync(join(project,'.pjm/pocketjs')).isDirectory());
  const cache=join(root,'.pjm/native-core'),names=readdirSync(cache).filter(name=>!name.startsWith('.'));assert.equal(names.length,1);
  const source=JSON.parse(readFileSync(join(cache,names[0],'source.json'),'utf8'));assert.equal(source.upstream,realpathSync(join(project,'.pjm/pocketjs')));
  writeFileSync(join(evidence,'source-resolution.json'),JSON.stringify(source,null,2)+'\n');writeFileSync(join(evidence,'generated-Cargo.toml'),readFileSync(join(cache,names[0],'Cargo.toml')));
 }
 writeFileSync(join(evidence,'result.json'),JSON.stringify({platform:'android',developmentGuestExit:exitMode,exitUnloadStorage:exitMode,closedAfterSourceEdit:exitMode,exitExplicitColdReopen:exitMode,freshSdkPublicNativeWorkflow:!!freshNativeSdk,developmentMediaMode:mediaMode??null,mediaColdHotDenial:mediaMode==='deny'||mediaMode==='undeclared',mediaLibraryReadRelease:mediaMode==='library',mediaChooserCancelled:mediaMode==='cancel',mediaCameraCancelled:mediaMode==='camera-cancel',mediaCameraPrivateFileCleaned:mediaMode==='camera-cancel'||mediaMode==='camera',mediaCameraJpegReadRelease:mediaMode==='camera',developmentLocationMode:locationMode??null,firstPermissionRequestTimedOut,locationColdHotDenial:!!locationMode&&locationMode!=='allow',realLocationProvider:locationMode==='allow',nativeLocationOsApproval:locationMode==='allow',locationColdHotApproval:locationMode==='allow',mixedHttpMediaQuota:mixedMode,liveHttpsSdk:httpMode,httpDomainDenied:httpMode,httpResourceReadRelease:httpMode,httpColdHotReload:httpMode,developmentClipboardReadMode:readMode??null,clipboardReadVerdict:readMode?expectedRead:null,realTsx:true,buttonNavigation:true,queryRetained:true,counterRetained:true,backgroundResume:true,systemBack:true,rootExit:true,coldReset:true,nativeClipboardWrite:networkMode,clipboardInvalidArgumentsRejected:networkMode,clipboardColdReopen:networkMode,clipboardHotReload:networkMode,nativeNetworkSnapshot:networkMode,networkTransitions:networkMode,networkInvalidArgumentsRejected:networkMode,networkHotReloadReset:networkMode,physicalDevicePerformanceMeasured:false},null,2));
 console.log('Actual Android TSX navigation passed: button routes, query/counter retention, Home/resume, system Back, root exit and cold reset.');
}finally{
 try{if(restoreConnectivity)await restoreConnectivity();}
 finally{if(host){host.kill('SIGTERM');await host.exited;}await logging;await log.end();rmSync(temp,{recursive:true,force:true});}
}
