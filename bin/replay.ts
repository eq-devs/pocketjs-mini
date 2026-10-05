import {lstatSync,openSync,writeFileSync,closeSync,fsyncSync,linkSync,unlinkSync} from 'node:fs';
import {readBoundedFile} from '../container/bounded-file.ts';
import {syncDirectory} from '../container/atomic-file.ts';
import {resolve,dirname,join} from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import {decodeNativeTape,TAPE_BYTES} from '../devtools/tape.ts';
import {decodeReplayGolden,encodeReplayGolden} from '../devtools/golden.ts';
import {encodeReplayPNG} from '../devtools/png.ts';
import {replayTape} from '../devtools/replay.ts';
const usage='pjm replay --package <main.pocket> --tape <tape.json> --app-id <id> --version <version> [--assert <golden.json>] [--output <new-golden.json>] [--png-frame <N> --png-output <new.png>] [--tree-frame <N> --tree-output <new.json>] [--timeout-ms <1..300000>] [--validate-only]';
export function replayArguments(args:readonly string[]){
 const flags=new Map<string,string>();let validate=false;
 for(let index=0;index<args.length;index++){
  const key=args[index];if(key==='--validate-only'&&!validate){validate=true;continue;}
  const value=args[++index];if(!['--package','--tape','--app-id','--version','--assert','--output','--png-frame','--png-output','--tree-frame','--tree-output','--timeout-ms'].includes(key)||flags.has(key)||!value||value.startsWith('--'))throw Error(usage);flags.set(key,value);
 }
 for(const key of ['--package','--tape','--app-id','--version'])if(!flags.has(key))throw Error(usage);
 if(!/^[a-zA-Z][a-zA-Z0-9_-]*(?:\.[a-zA-Z][a-zA-Z0-9_-]*)+$/.test(flags.get('--app-id')!)||flags.get('--app-id')!.length>128||!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(flags.get('--version')!)||flags.get('--version')!.length>64)throw Error('Invalid replay application identity/version');
 if(flags.has('--png-frame')!==flags.has('--png-output'))throw Error('PNG export requires --png-frame and --png-output');
 if(flags.has('--png-frame')&&!/^[1-9][0-9]*$/.test(flags.get('--png-frame')!))throw Error('Invalid PNG frame');
 if(flags.has('--tree-frame')!==flags.has('--tree-output'))throw Error('Tree export requires --tree-frame and --tree-output');
 if(flags.has('--tree-frame')&&!/^[1-9][0-9]*$/.test(flags.get('--tree-frame')!))throw Error('Invalid tree frame');
 if(flags.has('--timeout-ms')&&(!/^[1-9][0-9]*$/.test(flags.get('--timeout-ms')!)||Number(flags.get('--timeout-ms'))>300000))throw Error('Replay deadline must be 1..300000 ms');
 if(validate&&(flags.has('--output')||flags.has('--png-output')||flags.has('--tree-output')))throw Error('Validation does not produce a replay golden');return {flags,validate};
}
function read(path:string,limit:number){try{return readBoundedFile(path,limit);}catch(cause){throw Error('Replay input must be a bounded regular file',{cause});}}
export function saveReplayGolden(path:string,bytes:Uint8Array){
 const destination=resolve(path),temporary=join(dirname(destination),'.pjm-golden-'+randomUUID());let created=false;
 try{const fd=openSync(temporary,'wx',0o600);created=true;try{writeFileSync(fd,bytes);fsyncSync(fd);}finally{closeSync(fd);}linkSync(temporary,destination);syncDirectory(dirname(destination));}
 finally{if(created)unlinkSync(temporary);}
}
async function main(){
 const {flags,validate}=replayArguments(process.argv.slice(2)),payload=read(resolve(flags.get('--package')!),64*1024*1024),tapeBytes=read(resolve(flags.get('--tape')!),TAPE_BYTES),tape=decodeNativeTape(tapeBytes);
 if(createHash('sha256').update(payload).digest('hex')!==tape.packageSha256)throw Error('Replay package does not match tape');
 for(const frameFlag of ['--png-frame','--tree-frame'])if(flags.has(frameFlag)){const frame=Number(flags.get(frameFlag)),count=tape.steps.filter(step=>step.kind==='frame').length;if(!Number.isSafeInteger(frame)||frame>count)throw Error('Capture frame outside tape');}
 const outputs=['--output','--png-output','--tree-output'].filter(flag=>flags.has(flag)).map(flag=>resolve(flags.get(flag)!));if(new Set(outputs).size!==outputs.length)throw Error('Replay outputs must use distinct paths');
 const expected=flags.has('--assert')?decodeReplayGolden(read(resolve(flags.get('--assert')!),8*1024*1024),tapeBytes):undefined;
 if(validate){console.log(JSON.stringify({tapeValidated:true,packageHashMatched:true,nativeAdmission:false,packageSha256:tape.packageSha256,target:tape.target,frames:tape.steps.filter(step=>step.kind==='frame').length,golden:expected!==undefined}));return;}
 for(const outputFlag of ['--output','--png-output','--tree-output'])if(flags.has(outputFlag)){try{lstatSync(resolve(flags.get(outputFlag)!));throw Error('Replay output already exists');}catch(error:any){if(error.code!=='ENOENT')throw error;}}
 const extension=process.platform==='darwin'?'dylib':process.platform==='win32'?'dll':'so',library=resolve(import.meta.dir,'../core-ffi/target/release/'+(process.platform==='win32'?'':'lib')+'mini_core_ffi.'+extension);
 try{lstatSync(library);}catch{throw Error('Build the native core release library before replaying');}
 const {nativeReplayEngine}=await import('../devtools/native-engine.ts');
 const engine=nativeReplayEngine(library,{appId:flags.get('--app-id')!,version:flags.get('--version')!},flags.has('--tree-output'));
 const frames=replayTape(payload,tapeBytes,engine,expected,flags.has('--png-frame')?{frame:Number(flags.get('--png-frame')),receive:(pixels,width,height)=>saveReplayGolden(flags.get('--png-output')!,encodeReplayPNG(width,height,pixels))}:undefined,flags.has('--tree-frame')?{frame:Number(flags.get('--tree-frame')),receive:tree=>saveReplayGolden(flags.get('--tree-output')!,Buffer.from(JSON.stringify(tree)))}:undefined,{timeoutMs:flags.has('--timeout-ms')?Number(flags.get('--timeout-ms')):undefined});
 if(flags.has('--output'))saveReplayGolden(flags.get('--output')!,encodeReplayGolden(tapeBytes,frames));
 console.log(JSON.stringify({frames:frames.length,matched:expected!==undefined,...(flags.has('--output')?{output:resolve(flags.get('--output')!)}:{hashes:frames})}));
}
if(import.meta.main)main().catch(error=>{console.error('pjm: '+error.message);process.exitCode=1;});
