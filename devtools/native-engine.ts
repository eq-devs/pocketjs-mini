import {dlopen,FFIType,ptr,toArrayBuffer,CString,type Pointer} from 'bun:ffi';
import {lstatSync} from 'node:fs';
import type {ReplayEngine} from './replay.ts';
import {admitReplayPlan} from './plan.ts';
import {closeReplayResources} from './cleanup.ts';
export function nativeReplayEngine(path:string,identity:{appId:string;version:string},inspect=false):ReplayEngine{
 identity=Object.freeze({...identity});
 if(!['arm64','x64'].includes(process.arch))throw Error('Replay binding requires a 64-bit host');
 const info=lstatSync(path);if(!info.isFile()||info.isSymbolicLink())throw Error('Replay library must be a regular file');
 const p=FFIType.ptr,u=FFIType.u32,z=FFIType.u64_fast,i=FFIType.i32;
 const library=dlopen(path,{
 mp_abi_version:{args:[],returns:u},mp_create:{args:[p],returns:p},mp_destroy:{args:[p],returns:i},mp_last_error:{args:[p],returns:p},
 mp_package_select:{args:[p,z,u,p,z,p],returns:i},mp_boot:{args:[p,p,z,p,z],returns:i},mp_launch:{args:[p,p,z],returns:i},mp_lifecycle:{args:[p,u],returns:i},
 mp_frame_input:{args:[p,p],returns:i},mp_render:{args:[p,p],returns:i},mp_svc_take:{args:[p,p,z],returns:FFIType.i64_fast},mp_svc_post:{args:[p,p,z],returns:i}
 });
 let handle:Pointer|null=null,closed=false,started=false;const f=library.symbols;
 if(f.mp_abi_version()!==1){library.close();throw Error('Replay core ABI mismatch');}
 const inspector=(()=>{if(!inspect)return null;try{return dlopen(path,{mp_debug_tree:{args:[p,p,z],returns:FFIType.i64_fast}});}catch(error){library.close();throw error;}})();
 const check=(status:number)=>{if(status!==0){const message=handle?f.mp_last_error(handle):null;throw Error(message?String(new CString(message)):'Replay engine rejected input');}};
 const address=(view:DataView,offset:number)=>{const n=Number(view.getBigUint64(offset,true));if(!Number.isSafeInteger(n)||n<=0)throw Error('Invalid native pointer');return n as Pointer;};
 const length=(view:DataView,offset:number,max:number)=>{const n=Number(view.getBigUint64(offset,true));if(!Number.isSafeInteger(n)||n<0||n>max)throw Error('Invalid native slice length');return n;};
 const ready=()=>{if(closed||!handle||!started)throw Error('Replay engine unavailable');return handle;};
 return {
 boot(payload,tape){if(closed||handle)throw Error('Replay engine already booted');const output=new Uint8Array(56),v=new DataView(output.buffer);v.setUint32(0,56,true);const id=Buffer.from(identity.appId),target=tape.target==='pjm-ios'?1:2;
 check(f.mp_package_select(ptr(payload),payload.length,target,ptr(id),id.length,ptr(output)));
 admitReplayPlan(new Uint8Array(toArrayBuffer(address(v,40),0,length(v,48,1024*1024))),tape,identity);
 const config=new Uint32Array([28,1,tape.window.width,tape.window.height,tape.window.density,32*1024*1024,target]);handle=f.mp_create(ptr(config));if(!handle)throw Error('Replay engine creation failed');
 check(f.mp_boot(handle,address(v,8),length(v,16,16*1024*1024),address(v,24),length(v,32,64*1024*1024)));const launch=Buffer.from(tape.launchData);check(f.mp_launch(handle,ptr(launch),launch.length));check(f.mp_lifecycle(handle,2));started=true;
 },
 completion(record){const h=ready(),bytes=Buffer.from(record);check(f.mp_svc_post(h,ptr(bytes),bytes.length));},
 lifecycle(event){check(f.mp_lifecycle(ready(),{show:2,hide:3,memoryWarning:5}[event]));},
 frame(contacts,hits,cancelled){const h=ready(),input=new Uint8Array(84),v=new DataView(input.buffer);v.setUint32(0,84,true);v.setUint32(4,contacts.length,true);contacts.forEach((word,index)=>v.setUint32(8+index*4,word,true));hits.forEach((hit,index)=>v.setInt32(40+index*4,hit,true));v.setUint32(72,cancelled.length,true);input.set(cancelled,76);check(f.mp_frame_input(h,ptr(input)));const out=new Uint8Array(32),view=new DataView(out.buffer);check(f.mp_render(h,ptr(out)));const pixels=new Uint8Array(toArrayBuffer(address(view,0),0,length(view,8,16*1024*1024))).slice();const records=new Uint8Array(32*4097),count=Number(f.mp_svc_take(h,ptr(records),records.length));if(!Number.isSafeInteger(count)||count<0||count>records.length)throw Error('Replay mailbox drain failed');const text=new TextDecoder('utf-8',{fatal:true}).decode(records.subarray(0,count));return {pixels,effects:text?text.replace(/\n$/,'').split('\n'):[]};},
 inspectTree(){if(!inspector)throw Error('Inspector capability unavailable');const buffer=new Uint8Array(4*1024*1024),count=Number(inspector.symbols.mp_debug_tree(ready(),ptr(buffer),buffer.length));if(!Number.isSafeInteger(count)||count<0||count>buffer.length)throw Error('Native inspector snapshot failed');return buffer.slice(0,count);},
 close(){if(closed)return;closed=true;const owned=handle;handle=null;closeReplayResources([
  ()=>{if(owned&&f.mp_destroy(owned)!==0)throw Error('Replay engine destruction failed');},
  ()=>{inspector?.close();},()=>{library.close();}
 ]);}
 };
}
