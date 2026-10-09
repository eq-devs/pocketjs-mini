import {decodeInspectorTree,type InspectorTree} from './tree.ts';
import {createHash} from 'node:crypto';
import {decodeNativeTape,TAPE_BYTES,type NativeTape} from './tape.ts';
import {withReplayCleanup} from './cleanup.ts';
export interface ReplayEngine {
 boot(packageBytes:Uint8Array,tape:NativeTape):void;
 completion(record:string):void;
 lifecycle(event:'show'|'hide'|'memoryWarning'):void;
 frame(contacts:readonly number[],hits:readonly number[],cancelled:readonly number[]):{pixels:Uint8Array;effects:readonly string[]};
 inspectTree?():Uint8Array;
 hitTest?(x:number,y:number):number;
 close():void;
}
export interface ReplayFrame {frame:number;pixelsSha256:string;effectsSha256:string;}
export interface ReplayBudget {timeoutMs?:number;now?:()=>number;}
const sha=(bytes:Uint8Array)=>createHash('sha256').update(bytes).digest('hex');
function goldenFrames(value:unknown,count:number):readonly ReplayFrame[] {
 if(!Array.isArray(value)||value.length!==count)throw Error('Replay golden must cover every frame');
 const snapshot=value.map(frame=>Object.freeze({...frame}));
 for(let index=0;index<snapshot.length;index++){const frame=snapshot[index];if(Object.keys(frame).sort().join(',')!=='effectsSha256,frame,pixelsSha256'||frame.frame!==index+1||!['pixelsSha256','effectsSha256'].every(key=>typeof frame[key]==='string'&&/^[a-f0-9]{64}$/.test(frame[key])))throw Error('Invalid replay golden');}
 return Object.freeze(snapshot);
}
/** Native binding supplies the engine; validation and divergence checks occur before/at each turn. */
export function replayTape(packageBytes:Uint8Array,tapeBytes:Uint8Array,engine:ReplayEngine,golden?:unknown,capture?:{frame:number;receive:(pixels:Uint8Array,width:number,height:number)=>void},treeCapture?:{frame:number;receive:(tree:InspectorTree)=>void},budget:ReplayBudget={}):readonly ReplayFrame[] {
 return withReplayCleanup(()=>{
 if(!(packageBytes instanceof Uint8Array)||!packageBytes.length||packageBytes.length>64*1024*1024)throw Error('Replay package does not match tape');
 if(!(tapeBytes instanceof Uint8Array)||!tapeBytes.length||tapeBytes.length>TAPE_BYTES)throw Error('Tape byte limit');
 const snapshot=new Uint8Array(packageBytes),tapeSnapshot=new Uint8Array(tapeBytes);
 const timeout=budget.timeoutMs??60000,now=budget.now??(()=>performance.now());
 if(!Number.isSafeInteger(timeout)||timeout<1||timeout>300000)throw Error('Replay deadline must be 1..300000 ms');
 const start=now();let previous=start;
 const checkDeadline=()=>{const time=now();if(!Number.isFinite(time)||time<previous)throw Error('Invalid replay monotonic clock');previous=time;if(time-start>=timeout)throw Error('Replay total deadline exceeded');};
 if(!Number.isFinite(start))throw Error('Invalid replay monotonic clock');
 const tape=decodeNativeTape(tapeSnapshot);
 if(sha(snapshot)!==tape.packageSha256)throw Error('Replay package does not match tape');
 const count=tape.steps.filter(step=>step.kind==='frame').length,expected=golden===undefined?undefined:goldenFrames(golden,count),frames:ReplayFrame[]=[];
 if(capture&&(!Number.isSafeInteger(capture.frame)||capture.frame<1||capture.frame>count))throw Error('Capture frame outside tape');
 if(treeCapture&&(!Number.isSafeInteger(treeCapture.frame)||treeCapture.frame<1||treeCapture.frame>count||!engine.inspectTree))throw Error('Tree capture frame or capability unavailable');
  checkDeadline();
  engine.boot(snapshot,tape);
  for(const step of tape.steps){
   checkDeadline();
   if(step.kind==='completion'){engine.completion(step.record);continue;}
   if(step.kind==='lifecycle'){engine.lifecycle(step.event);continue;}
   const output=engine.frame(step.contacts,step.hits,step.cancelled);
   checkDeadline();
   const size=tape.window.width*tape.window.height*tape.window.density**2*4;
   if(output.pixels.length!==size||output.effects.length>32)throw Error('Invalid replay engine output');
   const effects=createHash('sha256');
   for(const record of output.effects){const bytes=Buffer.from(record);if(bytes.length>4096)throw Error('Replay effect exceeds record limit');const length=Buffer.alloc(4);length.writeUInt32LE(bytes.length);effects.update(length).update(bytes);}
   const frame=Object.freeze({frame:frames.length+1,pixelsSha256:sha(output.pixels),effectsSha256:effects.digest('hex')});
   if(capture?.frame===frame.frame)capture.receive(output.pixels.slice(),tape.window.width*tape.window.density,tape.window.height*tape.window.density);
   if(treeCapture?.frame===frame.frame)treeCapture.receive(decodeInspectorTree(engine.inspectTree!()));
   if(expected&&(expected[frames.length].pixelsSha256!==frame.pixelsSha256||expected[frames.length].effectsSha256!==frame.effectsSha256))throw Error('Replay diverged at frame '+frame.frame);
   frames.push(frame);
  }
  checkDeadline();
  return Object.freeze(frames);
 },()=>engine.close());
}
