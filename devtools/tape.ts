import {strictJson} from '../container/strict-json.ts';
export interface NativeTape {
 format:1; packageSha256:string;launchData:string;target:'pjm-ios'|'pjm-android';
 window:{width:number;height:number;density:number};
 steps:ReadonlyArray<Readonly<{kind:'frame';contacts:readonly number[];hits:readonly number[];cancelled:readonly number[]}|{kind:'completion';record:string}|{kind:'lifecycle';event:'show'|'hide'|'memoryWarning'}>>;
}
export const TAPE_BYTES=8*1024*1024,TAPE_STEPS=36000;
export function decodeNativeTape(bytes:Uint8Array):NativeTape {
 if(!bytes.length||bytes.length>TAPE_BYTES)throw Error('Tape byte limit');
 const tape=strictJson(bytes,{maxTokens:TAPE_STEPS*64+128}) as any,fail=()=>{throw Error('Invalid native tape');};
 const exact=(object:any,keys:string[])=>object && typeof object==='object'&&!Array.isArray(object)&&Object.keys(object).sort().join(',')===keys.sort().join(',');
 const integer=(value:any,min:number,max:number)=>Number.isSafeInteger(value)&&value>=min&&value<=max;
 if(!exact(tape,['format','packageSha256','launchData','target','window','steps'])||tape.format!==1||typeof tape.packageSha256!=='string'||!/^([a-f0-9]{64})$/.test(tape.packageSha256)||!['pjm-ios','pjm-android'].includes(tape.target))fail();
 if(typeof tape.launchData!=='string'||new TextEncoder().encode(tape.launchData).length>4096)fail();
 const launch=strictJson(new TextEncoder().encode(tape.launchData));if(!launch||typeof launch!=='object'||Array.isArray(launch))fail();
 if(!exact(tape.window,['width','height','density'])||!integer(tape.window.width,1,1024)||!integer(tape.window.height,1,1024)||!integer(tape.window.density,1,4)||tape.window.width*tape.window.height*tape.window.density**2>4194304)fail();
 if(!Array.isArray(tape.steps)||!tape.steps.length||tape.steps.length>TAPE_STEPS)fail();let frames=0;
 for(const step of tape.steps){
  if(step?.kind==='frame'){
   if(!exact(step,['kind','contacts','hits','cancelled'])||!Array.isArray(step.contacts)||!Array.isArray(step.hits)||!Array.isArray(step.cancelled)||step.contacts.length>8||step.hits.length!==step.contacts.length||step.cancelled.length>8||!step.contacts.every((value:any)=>integer(value,0,0xffffffff)&&(value&0x40000000)===0)||!step.hits.every((value:any)=>integer(value,-2147483648,2147483647))||!step.cancelled.every((value:any)=>integer(value,0,255)))fail();
   if(new Set(step.cancelled).size!==step.cancelled.length)fail();frames++;
   Object.freeze(step.contacts);Object.freeze(step.hits);Object.freeze(step.cancelled);
  }else if(step?.kind==='completion'){
   if(!exact(step,['kind','record'])||typeof step.record!=='string'||!step.record.length||new TextEncoder().encode(step.record).length>4096||/[\r\n]/.test(step.record))fail();
   const record=strictJson(new TextEncoder().encode(step.record)) as any;
   if(!record||Array.isArray(record)||record.v!==1||!integer(record.id,1,Number.MAX_SAFE_INTEGER)||typeof record.ok!=='boolean')fail();
  }else if(step?.kind==='lifecycle'){
   if(!exact(step,['kind','event'])||!['show','hide','memoryWarning'].includes(step.event))fail();
  }else fail();Object.freeze(step);
 }
 if(!frames)fail();Object.freeze(tape.window);Object.freeze(tape.steps);return Object.freeze(tape);
}
