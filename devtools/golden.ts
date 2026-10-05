import {createHash} from 'node:crypto';
import {strictJson} from '../container/strict-json.ts';
import {decodeNativeTape,TAPE_STEPS} from './tape.ts';
import type {ReplayFrame} from './replay.ts';
const hash=(bytes:Uint8Array)=>createHash('sha256').update(bytes).digest('hex');
const LIMIT=8*1024*1024;
function frames(value:unknown,count:number):readonly ReplayFrame[]{
 if(!Array.isArray(value)||value.length!==count)throw Error('Golden must cover every tape frame');
 return Object.freeze(value.map((frame,index)=>{
  if(!frame||Object.keys(frame).sort().join(',')!=='effectsSha256,frame,pixelsSha256'||frame.frame!==index+1||!['pixelsSha256','effectsSha256'].every(key=>typeof frame[key]==='string'&&/^[a-f0-9]{64}$/.test(frame[key])))throw Error('Invalid golden frame');
  return Object.freeze({...frame});
 }));
}
export function encodeReplayGolden(tapeBytes:Uint8Array,result:readonly ReplayFrame[]):Uint8Array{
 const tape=decodeNativeTape(tapeBytes),count=tape.steps.filter(step=>step.kind==='frame').length;
 const bytes=Buffer.from(JSON.stringify({format:1,tapeSha256:hash(tapeBytes),packageSha256:tape.packageSha256,frames:frames(result,count)}));
 if(bytes.length>LIMIT)throw Error('Replay golden byte limit');return bytes;
}
export function decodeReplayGolden(bytes:Uint8Array,tapeBytes:Uint8Array):readonly ReplayFrame[]{
 if(!bytes.length||bytes.length>LIMIT)throw Error('Replay golden byte limit');
 const tape=decodeNativeTape(tapeBytes),golden=strictJson(bytes,{maxTokens:TAPE_STEPS*16+128}) as any;
 if(!golden||Object.keys(golden).sort().join(',')!=='format,frames,packageSha256,tapeSha256'||golden.format!==1||golden.tapeSha256!==hash(tapeBytes)||golden.packageSha256!==tape.packageSha256)throw Error('Golden does not match original tape/package');
 return frames(golden.frames,tape.steps.filter(step=>step.kind==='frame').length);
}
