import {developmentMediaSource} from './development-media-fixture.ts';
import {developmentLocationSource} from './development-location-fixture.ts';
import {developmentHttpSource} from './development-http-fixture.ts';
import {cpSync,mkdirSync,mkdtempSync,readFileSync,writeFileSync,symlinkSync,rmSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import assert from 'node:assert/strict';
import {developmentClipboardReadSource} from './development-clipboard-read-fixture.ts';
import {writeNativeProject} from '../bin/native-project.ts';
import {developmentNetworkSource,developmentNetworkProof} from './development-network-fixture.ts';

const root=resolve(import.meta.dir,'..'),serial=Bun.argv[2];
if(!serial)throw Error('Usage: bun tests/navigation-native-ios.ts <booted simulator UUID>');
const temp=mkdtempSync(join(tmpdir(),'pjm-navigation-ios-')),project=join(temp,'navigation'),native=join(temp,'host');
const bundle='dev.pjm.navigation.a'+Date.now();
const readMode=process.env.PJM_DEVELOPMENT_CLIPBOARD_READ;assert.ok(!readMode||['allow','deny','undeclared'].includes(readMode));
const locationMode=process.env.PJM_DEVELOPMENT_LOCATION;assert.ok(!locationMode||['allow','deny','undeclared'].includes(locationMode));assert.ok(!locationMode||(!readMode&&process.env.PJM_DEVELOPMENT_HTTP!=='1'&&process.env.PJM_DEVELOPMENT_NETWORK==='1'));
const mediaMode=process.env.PJM_DEVELOPMENT_MEDIA;assert.ok(!mediaMode||['library','cancel','deny','undeclared'].includes(mediaMode));assert.ok(!mediaMode||(!locationMode&&!readMode&&process.env.PJM_DEVELOPMENT_HTTP!=='1'&&process.env.PJM_DEVELOPMENT_NETWORK==='1'));
const mediaUi=mediaMode==='library'||mediaMode==='cancel';
const expectedRead=readMode==='allow'?'SUCCESS':'DENIED';
const httpMode=process.env.PJM_DEVELOPMENT_HTTP==='1';
const networkMode=process.env.PJM_DEVELOPMENT_NETWORK==='1';
const evidence=resolve(process.env.PJM_NAVIGATION_EVIDENCE??join(root,'build/ios-validation/navigation-'+Date.now()));mkdirSync(evidence,{recursive:true});
let server:ReturnType<typeof Bun.spawn>|undefined,logging:Promise<unknown>|undefined,launched=false,locationInput=false;
const log=Bun.file(join(evidence,'server.log')).writer();
async function run(args:string[],cwd=root){
 const child=Bun.spawn(args,{cwd,stdout:'pipe',stderr:'pipe'});const timer=setTimeout(()=>child.kill('SIGTERM'),300000);
 try{const [status,out,err]=await Promise.all([child.exited,new Response(child.stdout).text(),new Response(child.stderr).text()]);assert.equal(status,0,args[0]+': '+err+'\n'+out);return out;}finally{clearTimeout(timer);}
}
async function wait<T>(read:()=>Promise<T>,accept:(value:T)=>boolean,timeoutMs=120000){
 const deadline=Date.now()+timeoutMs;let last:unknown;
 while(Date.now()<deadline){if(server?.exitCode!==null && server?.exitCode!==undefined)throw Error('Development server stopped');try{const value=await read();if(accept(value))return value;last=value;}catch(error){last=String(error);}await Bun.sleep(200);}
 throw Error('Navigation startup timeout: '+JSON.stringify(last));
}
try{
 await run([join(root,'bin/pjm'),'create','navigation'],temp);
 mkdirSync(join(project,'.pjm'));symlinkSync(join(root,'examples/hello/.pjm/pocketjs'),join(project,'.pjm/pocketjs'));
 for(const name of ['mini.json','app/main.tsx'])writeFileSync(join(project,name),readFileSync(join(root,'examples/navigation',name)));
 const navigationSource=readFileSync(join(project,'app/main.tsx'),'utf8');if(mediaMode){const metadata=JSON.parse(readFileSync(join(project,'mini.json'),'utf8'));metadata.permissions=mediaMode==='undeclared'?[]:['media'];writeFileSync(join(project,'mini.json'),JSON.stringify(metadata));writeFileSync(join(project,'app/main.tsx'),developmentMediaSource(navigationSource));}else if(locationMode){const metadata=JSON.parse(readFileSync(join(project,'mini.json'),'utf8'));metadata.permissions=locationMode==='undeclared'?[]:['location'];writeFileSync(join(project,'mini.json'),JSON.stringify(metadata));writeFileSync(join(project,'app/main.tsx'),developmentLocationSource(navigationSource));}else if(readMode){const metadata=JSON.parse(readFileSync(join(project,'mini.json'),'utf8'));metadata.permissions=readMode==='undeclared'?[]:['clipboard.read'];writeFileSync(join(project,'mini.json'),JSON.stringify(metadata));writeFileSync(join(project,'app/main.tsx'),developmentClipboardReadSource(navigationSource));}else if(httpMode){const metadata=JSON.parse(readFileSync(join(project,'mini.json'),'utf8'));metadata.domains=['example.com'];writeFileSync(join(project,'mini.json'),JSON.stringify(metadata));writeFileSync(join(project,'app/main.tsx'),developmentHttpSource(navigationSource));}else if(networkMode)writeFileSync(join(project,'app/main.tsx'),developmentNetworkSource(navigationSource));
 server=Bun.spawn([join(root,'bin/pjm'),'run'],{cwd:project,env:{...process.env,PJM_TEST_SERVER:'1'},stdout:'pipe',stderr:'pipe'});
 const copy=async(stream:ReadableStream<Uint8Array>)=>{for await(const bytes of stream)log.write(bytes);};logging=Promise.all([copy(server.stdout),copy(server.stderr)]);
 const session=await wait(async()=>JSON.parse(readFileSync(join(project,'build/session.json'),'utf8')),value=>!!value.url);
 await wait(async()=>{const response=await fetch(session.url+'state');return response.json() as Promise<any>;},value=>value.revision>0 && !value.error);
 cpSync(join(root,'host/ios'),native,{recursive:true});cpSync(join(root,'core-ffi/include/mini_core.h'),join(native,'mini_core.h'));
 writeNativeProject(native,'',join(root,'core-ffi/target/aarch64-apple-ios-sim/release/libmini_core_ffi.a'),session.url,true,bundle);
 const config=join(native,'TestConfig.swift');writeFileSync(config,readFileSync(config,'utf8')+'\nlet pjmNetworkMode = '+(networkMode?'true':'false')+'\nlet pjmHttpMode = '+(httpMode?'true':'false')+'\nlet pjmMediaMode = '+JSON.stringify(mediaMode??'')+'\nlet pjmLocationMode = '+JSON.stringify(locationMode??'')+'\nlet pjmClipboardReadMode = '+JSON.stringify(readMode??'')+'\n');
 cpSync(join(root,'tests/NavigationInputTests.swift'),join(native,'Tests.swift'));if(locationMode==='allow'){await run(['xcrun','simctl','location',serial,'set','43.238949,76.889709']);locationInput=true;}launched=true;
 let hotReloadError:unknown;
 const liveMediaReload=mediaUi?(async()=>{
  const ready=await wait(async()=>{const response=await fetch(session.url+'state');return response.json() as Promise<any>;},value=>value.deviceEvents?.some((event:any)=>event.kind==='log'&&event.message==='test:media-hot-ready'&&event.revision===value.revision),300000);
  writeFileSync(join(evidence,'live-reload-ready.json'),JSON.stringify(ready));
  writeFileSync(join(project,'app/main.tsx'),developmentMediaSource(navigationSource,'reloaded'));
  await wait(async()=>{const response=await fetch(session.url+'state');return response.json() as Promise<any>;},value=>value.revision>ready.revision&&!value.error);
 })().catch(error=>{hotReloadError=error;writeFileSync(join(evidence,'live-reload-failure.json'),JSON.stringify({error:String(error)},null,2));}):undefined;
 writeFileSync(join(evidence,'xcode.log'),await run(['xcodebuild','-quiet','-project',join(native,'Mini.xcodeproj'),'-scheme','Mini','-configuration','Debug','-destination','platform=iOS Simulator,id='+serial,'-derivedDataPath',join(native,'DerivedData'),'-parallel-testing-enabled','NO','-only-testing:MiniTests/MiniTests/testTsxNavigationAndRetainedState','-resultBundlePath',join(evidence,'Tests.xcresult'),'CODE_SIGNING_ALLOWED=NO','test']));
 await liveMediaReload;if(hotReloadError)throw hotReloadError;
 writeFileSync(join(evidence,'summary.json'),await run(['xcrun','xcresulttool','get','test-results','summary','--path',join(evidence,'Tests.xcresult')]));
 await run(['xcrun','xcresulttool','export','attachments','--path',join(evidence,'Tests.xcresult'),'--output-path',join(evidence,'attachments')]);
 if(networkMode){
  if(!mediaUi)await run(['xcrun','simctl','launch','--terminate-running-process',serial,bundle,'--pjm-url',session.url,'--pjm-inspect']);
  const snapshot=async()=>{const response=await fetch(session.url+'inspection');assert.ok(response.ok);return response.json() as Promise<any>;};
  const text=(value:any)=>value.tree.nodes.map((node:any)=>node.text).join('');
  const locationOK=(value:any)=>{if(!locationMode)return true;if(locationMode!=='allow')return text(value).includes('Location: DENIED');const fix=/Location: SUCCESS (-?[0-9.]+),(-?[0-9.]+)/.exec(text(value));return !!fix&&Math.abs(Number(fix[1])-43.238949)<0.0001&&Math.abs(Number(fix[2])-76.889709)<0.0001;};
  const httpOK=(value:any)=>(!mediaMode||text(value).includes(mediaMode==='library'?'Media: SUCCESS JPEG 64x32 released=DENIED':mediaMode==='cancel'?'Media: CANCELLED':'Media: DENIED'))&&locationOK(value)&&(!httpMode||/HTTP: SUCCESS bytes=\d+ domain=DENIED released=DENIED/.test(text(value)));
  let initial:any;
  if(!mediaUi){
   initial=await wait(snapshot,value=>{const proof=developmentNetworkProof(text(value));return proof?.fixture==='initial'&&!['unknown','none'].includes(proof.type)&&httpOK(value)&&(!readMode||text(value).includes('Clipboard read: '+expectedRead));});
   writeFileSync(join(project,'app/main.tsx'),mediaMode?developmentMediaSource(navigationSource,'reloaded'):locationMode?developmentLocationSource(navigationSource,'reloaded'):readMode?developmentClipboardReadSource(navigationSource,'reloaded'):httpMode?developmentHttpSource(navigationSource,'reloaded'):developmentNetworkSource(navigationSource,'reloaded'));
  }else initial=JSON.parse(readFileSync(join(evidence,'live-reload-ready.json'),'utf8'));
  const reloaded=await wait(snapshot,value=>{const proof=developmentNetworkProof(text(value));return value.revision>initial.revision&&proof?.fixture==='reloaded'&&!['unknown','none'].includes(proof.type)&&proof.events===0&&httpOK(value)&&(!readMode||text(value).includes('Clipboard read: '+expectedRead));});
  writeFileSync(join(evidence,'network-hot-reload.json'),JSON.stringify(reloaded));
  if(mediaUi){
   const attachments=JSON.parse(readFileSync(join(evidence,'attachments/manifest.json'),'utf8')).flatMap((group:any)=>group.attachments);
   const shot=attachments.find((item:any)=>item.suggestedHumanReadableName.startsWith('network-hot-reload_')&&item.exportedFileName.endsWith('.png'));assert.ok(shot,'Missing native live-reload screenshot');
   cpSync(join(evidence,'attachments',shot.exportedFileName),join(evidence,'network-hot-reload.png'));
  }else await run(['xcrun','simctl','io',serial,'screenshot',join(evidence,'network-hot-reload.png')]);
 }
 writeFileSync(join(evidence,'navigation.pocket'),readFileSync(join(project,'build/navigation.pocket')));
 writeFileSync(join(evidence,'result.json'),JSON.stringify({platform:'ios',developmentMediaMode:mediaMode??null,mediaColdHotDenial:mediaMode==='deny'||mediaMode==='undeclared',nativeMediaChooserCancelled:mediaMode==='cancel',mediaColdHotCancellation:mediaMode==='cancel',nativeMediaLibrarySelection:mediaMode==='library',nativeMediaJpegReadRelease:mediaMode==='library',mediaColdHotSelection:mediaMode==='library',developmentLocationMode:locationMode??null,locationColdHotDenial:!!locationMode&&locationMode!=='allow',locationColdHotApproval:locationMode==='allow',nativeLocationOsApproval:locationMode==='allow',simulatedLocationInput:locationMode==='allow',liveHttpsSdk:httpMode,httpDomainDenied:httpMode,httpResourceReadRelease:httpMode,httpColdHotReload:httpMode,developmentClipboardReadMode:readMode??null,clipboardReadVerdict:readMode?expectedRead:null,realTsx:true,buttonNavigation:true,queryRetained:true,counterRetained:true,backgroundResume:true,coldReset:true,nativeClipboardWrite:networkMode,clipboardInvalidArgumentsRejected:networkMode,clipboardColdReopen:networkMode,clipboardHotReload:networkMode,nativeNetworkSnapshot:networkMode,networkInvalidArgumentsRejected:networkMode,networkHotReloadReset:networkMode,networkTransitions:false,physicalDevicePerformanceMeasured:false},null,2));
 console.log('Actual UIKit TSX navigation passed: button routes, query/counter retention, Home/resume and cold reset.');
}finally{
 if(launched){await run(['xcrun','simctl','terminate',serial,bundle]).catch(()=>{});await run(['xcrun','simctl','uninstall',serial,bundle]).catch(()=>{});}
 if(locationInput)await run(['xcrun','simctl','location',serial,'clear']).catch(()=>{});
 if(server){server.kill('SIGTERM');await server.exited;}
 await logging;await log.end();rmSync(temp,{recursive:true,force:true});
}
