import {mkdtempSync,mkdirSync,readFileSync,writeFileSync,symlinkSync,rmSync} from "node:fs";
import {join,resolve} from "node:path";
import {tmpdir} from "node:os";
import assert from "node:assert/strict";
const root=resolve(import.meta.dir,".."),platform=Bun.argv[2],serial=Bun.argv[3];
if(!["ios","android"].includes(platform) || !serial)throw Error("Usage: bun tests/device-event-native.ts ios|android <serial>");
const temporary=mkdtempSync(join(tmpdir(),"pjm-native-event-")),project=join(temporary,"events");let child:ReturnType<typeof Bun.spawn>|undefined,logs:Promise<string>|undefined,exit:number|undefined;
const env={...process.env,PJM_NATIVE_TEST:"1"};
async function capture(stream:ReadableStream<Uint8Array>){const reader=stream.getReader(),decoder=new TextDecoder();let tail="";try{for(;;){const next=await reader.read();if(next.done)break;tail=(tail+decoder.decode(next.value,{stream:true})).slice(-12000);}return (tail+decoder.decode()).slice(-12000);}finally{reader.releaseLock();}}
async function wait<T>(read:()=>Promise<T>,accept:(value:T)=>boolean){let last:unknown;const deadline=Date.now()+180000;while(Date.now()<deadline){if(exit!==undefined)throw Error("Native run exited "+exit+":"+await logs);try{const value=await read();if(accept(value))return value;last=value;}catch(error){last=String(error);}await Bun.sleep(250);}throw Error("Native event timeout: "+JSON.stringify(last));}
try{
 const create=Bun.spawn([join(root,"bin/pjm"),"create","events"],{cwd:temporary,env,stdout:"ignore",stderr:"inherit"});assert.equal(await create.exited,0);
 const initialSource=join(project,"app/main.tsx");writeFileSync(initialSource,readFileSync(initialSource,"utf8")+'\nconsole.info("native-boot-proof 😀");\nconst logHost=globalThis as any,logFrame=logHost.frame;let logged=false;logHost.frame=(...args:any[])=>{if(!logged){logged=true;console.warn("native-console-proof 😀");}return logFrame(...args);};\n');
 mkdirSync(join(project,".pjm"));symlinkSync(join(root,"examples/hello/.pjm/pocketjs"),join(project,".pjm/pocketjs"));
 child=Bun.spawn([join(root,"bin/pjm"),"run","--device",platform,"-d",serial],{cwd:project,env,stdout:"pipe",stderr:"pipe"});logs=Promise.all([capture(child.stdout),capture(child.stderr)]).then(parts=>parts.join("\n"));void child.exited.then(value=>{exit=value;});
 const session=await wait(async()=>JSON.parse(readFileSync(join(project,"build/session.json"),"utf8")),value=>!!value.url);
 const state=()=>fetch(session.url+"state").then(response=>response.json()) as Promise<any>;
 const admitted=(value:any)=>[["info","native-boot-proof 😀"],["warn","native-console-proof 😀"]].every(([level,message])=>value.deviceEvents?.some((event:any)=>event.platform===platform && event.revision===value.revision && event.kind==="log" && event.level===level && event.message===message)) && value.deviceEvents?.some((event:any)=>event.platform===platform && event.revision===value.revision && event.kind==="frame-ready");
 const first=await wait(state,admitted);
 const source=join(project,"app/main.tsx"),savedAt=performance.now();writeFileSync(source,readFileSync(source,"utf8").replace("Hello PocketJS Mini","Device event rebuild"));
 const second=await wait(state,value=>value.revision>first.revision && admitted(value));
 const saveToObservedFrameAndLogsMs=Math.round(performance.now()-savedAt);
 console.log(JSON.stringify({platform,saveToObservedFrameAndLogsMs,firstRevision:first.revision,secondRevision:second.revision,events:second.deviceEvents,builds:second.builds}));
}finally{if(child && exit===undefined){child.kill("SIGTERM");const timeout=setTimeout(()=>child?.kill("SIGKILL"),20000);await child.exited;clearTimeout(timeout);}if(logs){const output=await logs;if(output)console.error(output.slice(-12000));}rmSync(temporary,{recursive:true,force:true});}
