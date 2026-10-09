import {createHash} from 'node:crypto';
import {decodeNativeTape,TAPE_BYTES,type NativeTape} from './tape.ts';
import type {ReplayEngine,ReplayFrame} from './replay.ts';

export type ReplaySessionState='paused'|'playing'|'completed'|'failed'|'closed';
export interface ReplaySessionSnapshot {state:ReplaySessionState;step:number;totalSteps:number;frame:number;totalFrames:number;current:ReplayFrame|null;error:string|null;}
const sha=(bytes:Uint8Array)=>createHash('sha256').update(bytes).digest('hex');
function frameResult(output:ReturnType<ReplayEngine['frame']>,frame:number,tape:NativeTape):ReplayFrame{
 const size=tape.window.width*tape.window.height*tape.window.density**2*4;
 if(!(output.pixels instanceof Uint8Array)||output.pixels.length!==size||!Array.isArray(output.effects)||output.effects.length>32)throw Error('Invalid replay engine output');
 const effects=createHash('sha256');
 for(const record of output.effects){if(typeof record!=='string')throw Error('Invalid replay effect');const bytes=Buffer.from(record);if(bytes.length>4096)throw Error('Replay effect exceeds record limit');const length=Buffer.alloc(4);length.writeUInt32LE(bytes.length);effects.update(length).update(bytes);}
 return Object.freeze({frame,pixelsSha256:sha(output.pixels),effectsSha256:effects.digest('hex')});
}

/** Owner-thread replay controller. A host calls tick between UI turns while playing. */
export class ReplaySession {
 readonly tape:NativeTape;private readonly packageBytes:Uint8Array;private readonly factory:()=>ReplayEngine;
 private engine:ReplayEngine|null=null;private position=0;private frameNumber=0;private current:ReplayFrame|null=null;
 private state:ReplaySessionState='paused';private failure:string|null=null;
 constructor(packageBytes:Uint8Array,tapeBytes:Uint8Array,factory:()=>ReplayEngine){
  if(!(packageBytes instanceof Uint8Array)||!packageBytes.length||packageBytes.length>64*1024*1024)throw Error('Replay package does not match tape');
  if(!(tapeBytes instanceof Uint8Array)||!tapeBytes.length||tapeBytes.length>TAPE_BYTES)throw Error('Tape byte limit');
  if(typeof factory!=='function')throw Error('Replay engine factory required');
  this.packageBytes=new Uint8Array(packageBytes);this.tape=decodeNativeTape(new Uint8Array(tapeBytes));this.factory=factory;
  if(sha(this.packageBytes)!==this.tape.packageSha256)throw Error('Replay package does not match tape');this.boot();
 }
 private boot(){const engine=this.factory();if(!engine||typeof engine.boot!=='function'||typeof engine.close!=='function')throw Error('Invalid replay engine');try{engine.boot(this.packageBytes.slice(),this.tape);this.engine=engine;}catch(error){try{engine.close();}catch{}throw error;}}
 private fail(error:unknown):never{this.failure=error instanceof Error?error.message:String(error);this.state='failed';const engine=this.engine;this.engine=null;try{engine?.close();}catch{}throw error;}
 private execute(){
  if(!this.engine||['failed','closed','completed'].includes(this.state))throw Error('Replay session is not runnable');
  const step=this.tape.steps[this.position];if(!step){this.state='completed';return;}
  try{if(step.kind==='completion')this.engine.completion(step.record);else if(step.kind==='lifecycle')this.engine.lifecycle(step.event);else{const output=this.engine.frame(step.contacts,step.hits,step.cancelled);this.current=frameResult(output,++this.frameNumber,this.tape);}this.position++;if(this.position===this.tape.steps.length)this.state='completed';}catch(error){this.fail(error);}
 }
 snapshot():ReplaySessionSnapshot{return Object.freeze({state:this.state,step:this.position,totalSteps:this.tape.steps.length,frame:this.frameNumber,totalFrames:this.tape.steps.filter(step=>step.kind==='frame').length,current:this.current,error:this.failure});}
 play(){if(this.state==='paused')this.state='playing';else if(this.state!=='playing')throw Error('Replay session cannot play');return this.snapshot();}
 pause(){if(this.state==='playing')this.state='paused';else if(this.state!=='paused')throw Error('Replay session cannot pause');return this.snapshot();}
 tick(){if(this.state!=='playing')return this.snapshot();this.execute();return this.snapshot();}
 step(){if(this.state!=='paused')throw Error('Pause replay before stepping');this.execute();if(this.position<this.tape.steps.length)this.state='paused';return this.snapshot();}
 seek(position:number){if(this.state==='closed')throw Error('Replay session is closed');if(!Number.isSafeInteger(position)||position<0||position>this.tape.steps.length)throw Error('Replay seek outside tape');const old=this.engine;this.engine=null;try{old?.close();}catch(error){return this.fail(error);}this.position=0;this.frameNumber=0;this.current=null;this.failure=null;this.state='paused';try{this.boot();while(this.position<position)this.execute();if(this.position===this.tape.steps.length)this.state='completed';else this.state='paused';return this.snapshot();}catch(error){return this.fail(error);}}
 close(){if(this.state==='closed')return this.snapshot();const engine=this.engine;this.engine=null;this.state='closed';try{engine?.close();}catch(error){this.failure=error instanceof Error?error.message:String(error);throw error;}return this.snapshot();}
}
