import {test,expect} from 'bun:test';
import assert from 'node:assert/strict';
import {connectMiniApp,type FrameHost} from '../sdk/native.ts';
test('location SDK bounds options and position replies while preserving frame delivery and cancellation',async()=>{
 const sent:any[]=[];let reply='';const host:FrameHost={frame(){},ui:{svcOpen:()=>true,svcSend:line=>sent.push(JSON.parse(line)),svcPoll:()=>{const line=reply;reply='';return line;}}};const app=connectMiniApp({host});
 for(const options of [{timeoutMs:0},{timeoutMs:15001},{maximumAgeMs:-1},{maximumAgeMs:60001},{highAccuracy:1},{timeoutMs:null},{maximumAgeMs:null},{highAccuracy:null},{extra:true},[]])expect(()=>app.location.get(options as any)).toThrow();expect(sent).toEqual([]);
 const work=app.location.get();expect(sent.at(-1).kind).toBe('location.get.v1');expect(sent.at(-1).args).toEqual({timeoutMs:15000,maximumAgeMs:0,highAccuracy:false});
 const position={latitude:43.25,longitude:76.95,accuracyMeters:20,timestampMs:1760000000000};let settled=false;work.promise.then(()=>{settled=true;});reply=JSON.stringify({v:1,id:sent.at(-1).id,ok:true,data:position});await Promise.resolve();expect(settled).toBe(false);host.frame!();const received=await work.promise;expect(received).toEqual(position);expect(Object.isFrozen(received)).toBe(true);
 for(const data of [null,{...position,latitude:91},{...position,longitude:-181},{...position,accuracyMeters:-1},{...position,timestampMs:1.5},{...position,extra:true}]){const request=app.location.get(),failure=assert.rejects(request.promise,{code:'PROTOCOL'});reply=JSON.stringify({v:1,id:sent.at(-1).id,ok:true,data});host.frame!();await failure;}
 const pending=app.location.get(),cancelled=assert.rejects(pending.promise,{code:'CANCELLED'});pending.cancel();await cancelled;expect(sent.at(-1).kind).toBe('cancel.v1');app.dispose();
});
