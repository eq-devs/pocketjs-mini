import {mkdirSync,mkdtempSync,readFileSync,writeFileSync,symlinkSync,rmSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {androidSdk} from '../bin/android.ts';
import {decodeNativeTape} from '../devtools/tape.ts';
import {replayTape} from '../devtools/replay.ts';
import {nativeReplayEngine} from '../devtools/native-engine.ts';
import {cyanViewportEdges} from './screenshot-pixels.ts';
const root=resolve(import.meta.dir,'..'),serial=Bun.argv[2];
if(!serial||!/^[a-zA-Z0-9_.:-]+$/.test(serial))throw Error('Usage: bun tests/recording-native-android.ts <adb serial>');
const temp=mkdtempSync(join(tmpdir(),'pjm-record-android-')),project=join(temp,'capture');
const evidence=resolve(process.env.PJM_RECORD_EVIDENCE??join(root,'build/android-validation/recording-'+Date.now()));mkdirSync(evidence,{recursive:true});
const env={...process.env,PJM_RECORD:'1',PJM_INSPECT:'1',PJM_ANDROID_TEST:'1'};
const adb=(...args:string[])=>[join(androidSdk(),'platform-tools/adb'),'-s',serial,...args];
let host:ReturnType<typeof Bun.spawn>|undefined;
async function run(args:string[],cwd=temp){const child=Bun.spawn(args,{cwd,env,stdout:'pipe',stderr:'pipe'});const timer=setTimeout(()=>child.kill(),30000);try{const [status,out,err]=await Promise.all([child.exited,new Response(child.stdout).text(),new Response(child.stderr).text()]);if(status!==0)throw Error(args[0]+': '+err);return out.trim();}finally{clearTimeout(timer);}}
async function screenshot(name:string){const child=Bun.spawn(adb('exec-out','screencap','-p'),{stdout:'pipe',stderr:'pipe'});const [status,bytes,error]=await Promise.all([child.exited,new Response(child.stdout).arrayBuffer(),new Response(child.stderr).text()]);assert.equal(status,0,error);writeFileSync(join(evidence,name),new Uint8Array(bytes));}
async function wait<T>(read:()=>Promise<T>,accept:(value:T)=>boolean){const deadline=Date.now()+300000;let last:unknown;while(Date.now()<deadline){if(host?.exitCode!==null&&host?.exitCode!==undefined)throw Error('Native host stopped; inspect '+join(evidence,'server.log'));try{const value=await read();if(accept(value))return value;last=value;}catch(error){last=String(error);}await Bun.sleep(250);}throw Error('Android recording timeout: '+JSON.stringify(last));}
try{
 await run([join(root,'bin/pjm'),'create','capture']);mkdirSync(join(project,'.pjm'));symlinkSync(join(root,'examples/hello/.pjm/pocketjs'),join(project,'.pjm/pocketjs'));
 const source=join(project,'app/main.tsx');writeFileSync(source,'import {connectMiniApp} from "@pocketjs/mini";\n'+readFileSync(source,'utf8')+'\nconst recordingMini=connectMiniApp();recordingMini.after(3,()=>recordingMini.deviceInfo().promise.then(info=>{if(info.platform!=="android")throw Error("Wrong platform");console.info("recording-service-delivered");}));\n');
 const log=Bun.file(join(evidence,'server.log')).writer();host=Bun.spawn([join(root,'bin/pjm'),'run','--device','android','-d',serial],{cwd:project,env,stdout:'pipe',stderr:'pipe'});
 const copy=async(stream:ReadableStream<Uint8Array>)=>{for await(const bytes of stream)log.write(bytes);};const logging=Promise.all([copy(host.stdout),copy(host.stderr)]);
 const session=await wait(async()=>JSON.parse(readFileSync(join(project,'build/session.json'),'utf8')),value=>!!value.url);
 const state=()=>fetch(session.url+'state').then(r=>r.json()) as Promise<any>;
 const receipt=async()=>JSON.parse(await run(adb('shell','run-as','dev.pjm.android','cat','files/pjm-receipt.json')));
 const started=await wait(receipt,value=>value.session===session.url&&value.frames>=30);
 await run(adb('shell','input','tap',String(Math.floor((started.left+started.width/2)*started.density)),String(Math.floor((started.top+started.height/2)*started.density))));
 await wait(receipt,value=>value.session===session.url&&value.touches>0);
 await wait(async()=>{const response=await fetch(session.url+'inspection');if(!response.ok)return null;const snapshot=await response.json();const selected=await fetch(session.url+'inspection/select',{method:'POST',body:JSON.stringify({revision:snapshot.revision,frame:snapshot.frame,nodeId:1})});if(!selected.ok)return null;const value=await receipt();return value.session===session.url?value:null;},value=>value?.highlight===1);
 // Keep selecting fresh snapshots while screencap runs: admission expires on
 // every tree update, and ADB screenshot delivery can outlast that interval.
 let keepSelecting=true;
 const selectionPump=(async()=>{while(keepSelecting){try{const snapshot=await(await fetch(session.url+'inspection')).json();await fetch(session.url+'inspection/select',{method:'POST',body:JSON.stringify({revision:snapshot.revision,frame:snapshot.frame,nodeId:1})});}catch{}await Bun.sleep(100);}})();
 try {await wait(async()=>{await screenshot('native-inspection-highlight.png');return cyanViewportEdges(readFileSync(join(evidence,'native-inspection-highlight.png')));},count=>count>100);}finally{keepSelecting=false;await selectionPump;}
 const selectedSnapshot=await(await fetch(session.url+'inspection')).json();
 const cleared=await fetch(session.url+'inspection/select',{method:'POST',body:JSON.stringify({revision:selectedSnapshot.revision,frame:selectedSnapshot.frame,nodeId:0})});assert.equal(cleared.status,200);
 await wait(receipt,value=>value.session===session.url&&value.highlight===0);await screenshot('native-inspection-cleared.png');assert.equal(cyanViewportEdges(readFileSync(join(evidence,'native-inspection-cleared.png'))),0);
 await run(adb('shell','input','keyevent','KEYCODE_HOME'));await Bun.sleep(500);
 await run(adb('shell','am','start','-W','-f','0x00020000','-n','dev.pjm.android/.MiniActivity','--es','pjm-url',session.url,'--ez','pjm-test','true','--ez','pjm-record','true'));
 const recorded=await wait(state,value=>value.recordingAvailable);
 assert.equal((await receipt()).highlight,0);
 const inspection=await(await fetch(session.url+'inspection')).json();writeFileSync(join(evidence,'inspection.json'),JSON.stringify(inspection));assert.equal(inspection.revision,recorded.revision);assert.equal(inspection.platform,'android');assert.match(inspection.tree.nodes.map((node:any)=>node.text).join(''),/Count:\s*1/);
 assert.ok(inspection.tree.nodes.every((node:any)=>Object.hasOwn(node,'bounds')));assert.deepEqual(inspection.tree.nodes.find((node:any)=>node.id===1).bounds,[0,0,recorded.window.width,recorded.window.height]);
 const bytes=new Uint8Array(await(await fetch(session.url+'recording')).arrayBuffer()),tape=decodeNativeTape(bytes),payload=readFileSync(join(project,'build/capture.pocket'));
 assert.equal(tape.packageSha256,createHash('sha256').update(payload).digest('hex'));assert.equal(tape.target,'pjm-android');
 assert.ok(tape.steps.filter(step=>step.kind==='frame').length>=600);assert.ok(tape.steps.some(step=>step.kind==='frame'&&step.contacts.length>0));
 const lifecycle=tape.steps.filter(step=>step.kind==='lifecycle').map(step=>(step as any).event);assert.deepEqual(lifecycle,['hide','show']);
 assert.ok(tape.steps.some(step=>step.kind==='completion'&&JSON.parse(step.record).data?.platform==='android'));
 assert.ok(recorded.deviceEvents.some((event:any)=>event.message==='recording-service-delivered'));
 const factory=()=>nativeReplayEngine(join(root,'core-ffi/target/release/libmini_core_ffi.dylib'),{appId:recorded.metadata.appId,version:recorded.metadata.version});
 const first=replayTape(payload,bytes,factory());assert.deepEqual(replayTape(payload,bytes,factory(),first),first);assert.ok(new Set(first.map(frame=>frame.pixelsSha256)).size>1);
 writeFileSync(join(evidence,'recording.json'),bytes);writeFileSync(join(evidence,'capture.pocket'),payload);writeFileSync(join(evidence,'frames.json'),JSON.stringify(first));writeFileSync(join(evidence,'result.json'),JSON.stringify({frames:first.length,steps:tape.steps.length,touchCaptured:true,lifecycle,matchingNativeReplays:2,hostPixelsCompared:false}));
 console.log('Android actual host recording passed: touch, lifecycle, SDK reply and two matching native replays. Host GPU pixels and physical performance were not compared.');
 host.kill('SIGTERM');await host.exited;await logging;await log.end();host=undefined;
}finally{if(host){host.kill('SIGTERM');await host.exited;}rmSync(temp,{recursive:true,force:true});}
