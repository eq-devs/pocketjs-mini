import {createHash} from 'node:crypto';
import {decodeNativeTape,TAPE_BYTES,TAPE_STEPS,type NativeTape} from './tape.ts';
type Step=NativeTape['steps'][number];
/** One recorder per original package/generation; hosts feed events on their owner thread. */
export class TapeRecorder {
 private readonly header:Omit<NativeTape,'steps'>;
 private steps:Step[]=[];
 private encodedBytes:number;
 private stopped=false;
 constructor(packageBytes:Uint8Array,target:NativeTape['target'],window:NativeTape['window'],launchData='{}'){
  if(!packageBytes.length||packageBytes.length>64*1024*1024)throw Error('Recording package byte limit');
  const candidate={format:1,launchData,packageSha256:createHash('sha256').update(packageBytes).digest('hex'),target,window:{...window},steps:[{kind:'frame',contacts:[],hits:[],cancelled:[]}]};
  const {steps,...header}=decodeNativeTape(Buffer.from(JSON.stringify(candidate)));this.header=Object.freeze(header);
  this.encodedBytes=Buffer.byteLength(JSON.stringify({...header,steps:[]}));
 }
 append(step:Step):void {
  if(this.stopped)throw Error('Tape recorder has stopped');
  // Validate/snapshot one record in constant time rather than revalidating all past frames.
  const candidate={...this.header,steps:step.kind==='frame'?[step]:[step,{kind:'frame',contacts:[],hits:[],cancelled:[]}]};
  const admitted=decodeNativeTape(Buffer.from(JSON.stringify(candidate))).steps[0];
  const added=Buffer.byteLength(JSON.stringify(admitted))+(this.steps.length?1:0);
  if(this.steps.length>=TAPE_STEPS||this.encodedBytes+added>TAPE_BYTES){this.stopped=true;throw Error('Tape recording capacity reached');}
  this.steps.push(admitted);this.encodedBytes+=added;
 }
 finish():Uint8Array {
  if(!this.steps.some(step=>step.kind==='frame'))throw Error('Tape recording has no frames');
  this.stopped=true;return Buffer.from(JSON.stringify({...this.header,steps:this.steps}));
 }
 get stepCount(){return this.steps.length;}
}
