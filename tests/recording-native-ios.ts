import {cpSync,mkdirSync,mkdtempSync,readFileSync,writeFileSync,symlinkSync,rmSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {writeNativeProject} from '../bin/native-project.ts';
import {decodeNativeTape} from '../devtools/tape.ts';
import {replayTape} from '../devtools/replay.ts';
import {nativeReplayEngine} from '../devtools/native-engine.ts';
import {inspectionGeometryGuest} from './inspection-geometry-guest.ts';

const root=resolve(import.meta.dir,'..'),serial=Bun.argv[2];
if(!serial)throw Error('Usage: bun tests/recording-native-ios.ts <booted simulator UUID>');
const temporary=mkdtempSync(join(tmpdir(),'pjm-record-ios-')),project=join(temporary,'capture'),host=join(temporary,'host');
const bundle='dev.pjm.record.a'+Date.now();
const evidence=resolve(process.env.PJM_RECORD_EVIDENCE??join(root,'build/ios-validation/recording-'+Date.now()));
mkdirSync(evidence,{recursive:true});
let server:ReturnType<typeof Bun.spawn>|undefined,launched=false;
async function run(args:string[],cwd=root){
 const child=Bun.spawn(args,{cwd,stdout:'pipe',stderr:'pipe'});
 const timer=setTimeout(()=>child.kill('SIGTERM'),180000);
 try{const [status,out,err]=await Promise.all([child.exited,new Response(child.stdout).text(),new Response(child.stderr).text()]);if(status!==0)throw Error(args[0]+' failed: '+err+'\n'+out);return out;}finally{clearTimeout(timer);}
}
async function wait<T>(read:()=>Promise<T>,accept:(value:T)=>boolean){
 const deadline=Date.now()+120000;let last:unknown;
 while(Date.now()<deadline){if(server?.exitCode!==null&&server?.exitCode!==undefined)throw Error('Development server stopped');try{const value=await read();if(accept(value))return value;last=value;}catch(error){last=String(error);}await Bun.sleep(200);}
 throw Error('Recording timeout: '+JSON.stringify(last));
}
try{
 await run([join(root,'bin/pjm'),'create','capture'],temporary);
 mkdirSync(join(project,'.pjm'));symlinkSync(join(root,'examples/hello/.pjm/pocketjs'),join(project,'.pjm/pocketjs'));
 const source=join(project,'app/main.tsx');
 writeFileSync(source,'import {connectMiniApp} from "@pocketjs/mini";\n'+readFileSync(source,'utf8')+'\nconst captureMini=connectMiniApp();captureMini.after(3,()=>{captureMini.deviceInfo().promise.then(info=>{if(info.platform!=="ios")throw Error("Wrong native platform");console.info("recording-service-delivered");});});\n');
 if(process.env.PJM_INSPECTION_GEOMETRY==='1')writeFileSync(source,readFileSync(source,'utf8')+inspectionGeometryGuest);
 const log=Bun.file(join(evidence,'server.log')).writer();
 server=Bun.spawn([join(root,'bin/pjm'),'run'],{cwd:project,env:{...process.env,PJM_TEST_SERVER:'1'},stdout:'pipe',stderr:'pipe'});
 const copy=async(stream:ReadableStream<Uint8Array>)=>{for await(const bytes of stream)log.write(bytes);};
 const logging=Promise.all([copy(server.stdout),copy(server.stderr)]);
 const session=await wait(async()=>JSON.parse(readFileSync(join(project,'build/session.json'),'utf8')),value=>!!value.url);
 const state=()=>fetch(session.url+'state').then(r=>r.json()) as Promise<any>;
 await wait(state,value=>value.revision>0&&!value.error);
 cpSync(join(root,'host/ios'),host,{recursive:true});cpSync(join(root,'core-ffi/include/mini_core.h'),join(host,'mini_core.h'));
 writeNativeProject(host,'',join(root,'core-ffi/target/aarch64-apple-ios-sim/release/libmini_core_ffi.a'),session.url,true,bundle);
 cpSync(join(root,'tests/RecordingInputTests.swift'),join(host,'Tests.swift'));launched=true;
 writeFileSync(join(evidence,'xcode.log'),await run(['xcodebuild','-quiet','-project',join(host,'Mini.xcodeproj'),'-scheme','Mini','-configuration','Debug','-destination','platform=iOS Simulator,id='+serial,'-derivedDataPath',join(host,'DerivedData'),'-parallel-testing-enabled','NO','-resultBundlePath',join(evidence,'Tests.xcresult'),'CODE_SIGNING_ALLOWED=NO','test']));
 await run(['xcrun','xcresulttool','export','attachments','--path',join(evidence,'Tests.xcresult'),'--output-path',join(evidence,'attachments')]);
 const recorded=await wait(state,value=>value.recordingAvailable);
 const inspection=await(await fetch(session.url+'inspection')).json();
 writeFileSync(join(evidence,'inspection.json'),JSON.stringify(inspection));
 assert.equal(inspection.revision,recorded.revision);assert.equal(inspection.platform,'ios');assert.match(inspection.tree.nodes.map((node:any)=>node.text).join(''),/Count:\s*1/,'Live native inspection did not reflect the actual UIKit tap: '+JSON.stringify(inspection.tree.nodes.map((node:any)=>node.text)));
 assert.ok(inspection.tree.nodes.every((node:any)=>Object.hasOwn(node,'bounds')),'Mobile core did not export screen bounds');
 assert.deepEqual(inspection.tree.nodes.find((node:any)=>node.id===1).bounds,[0,0,recorded.window.width,recorded.window.height]);
 if(process.env.PJM_INSPECTION_GEOMETRY==='1')for(const label of ['inspection-rotated','inspection-clipped','inspection-projected']){const marker=inspection.tree.nodes.find((node:any)=>node.text===label);assert.ok(inspection.tree.nodes.find((node:any)=>node.id===marker?.parent)?.bounds,'Missing transformed screen bounds: '+label);}
 const tapeBytes=new Uint8Array(await(await fetch(session.url+'recording')).arrayBuffer()),tape=decodeNativeTape(tapeBytes);
 const payload=readFileSync(join(project,'build/capture.pocket'));
 assert.equal(tape.packageSha256,createHash('sha256').update(payload).digest('hex'));
 assert.equal(tape.target,'pjm-ios');assert.equal(tape.launchData,'{"source":"development","query":{}}');
 assert.ok(tape.steps.filter(step=>step.kind==='frame').length>=600);
 assert.ok(tape.steps.some(step=>step.kind==='frame'&&step.contacts.length>0),'UIKit touch was not captured');
 const events=tape.steps.filter(step=>step.kind==='lifecycle').map(step=>(step as any).event);
 assert.deepEqual(events,['hide','show']);
 assert.ok(tape.steps.some(step=>step.kind==='completion'&&JSON.parse(step.record).data?.platform==='ios'),'SDK native device-info completion was not recorded');
 assert.ok(recorded.deviceEvents.some((event:any)=>event.message==='recording-service-delivered'),'SDK did not receive the native completion');
 const factory=()=>nativeReplayEngine(join(root,'core-ffi/target/release/libmini_core_ffi.dylib'),{appId:recorded.metadata.appId,version:recorded.metadata.version});
 const first=replayTape(payload,tapeBytes,factory()),second=replayTape(payload,tapeBytes,factory(),first);
 assert.deepEqual(second,first);
 writeFileSync(join(evidence,'recording.json'),tapeBytes);writeFileSync(join(evidence,'capture.pocket'),payload);writeFileSync(join(evidence,'frames.json'),JSON.stringify(first));
 assert.ok(new Set(first.map(frame=>frame.pixelsSha256)).size>1,'Recorded touch did not change replay pixels');
 writeFileSync(join(evidence,'result.json'),JSON.stringify({frames:first.length,steps:tape.steps.length,packageSha256:tape.packageSha256,window:tape.window,matchingNativeReplays:2,touchCaptured:true,lifecycle:events,hostPixelsCompared:false}));
 console.log('iOS real host capture passed: UIKit touch, hide/show, SDK completion, exact package binding and two matching native replays. Host GPU pixels and physical-device performance were not compared.');
 server.kill('SIGTERM');await server.exited;await logging;await log.end();server=undefined;
}finally{
 if(launched){await run(['xcrun','simctl','terminate',serial,bundle]).catch(()=>{});await run(['xcrun','simctl','uninstall',serial,bundle]).catch(()=>{});}
 if(server){server.kill('SIGTERM');await server.exited;}
 rmSync(temporary,{recursive:true,force:true});
}
