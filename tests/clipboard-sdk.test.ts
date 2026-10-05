import {test,expect} from 'bun:test';
import assert from 'node:assert/strict';
import {connectMiniApp,type FrameHost} from '../sdk/native.ts';
test('clipboard SDK validates text and replies at frame boundaries with cancellation',async()=>{
 const sent:any[]=[];let reply='';const host:FrameHost={frame(){},ui:{svcOpen:()=>true,svcSend:line=>sent.push(JSON.parse(line)),svcPoll:()=>{const next=reply;reply='';return next;}}},app=connectMiniApp({host});
 const deliver=(data:unknown)=>{reply=JSON.stringify({v:1,id:sent.at(-1).id,ok:true,data});host.frame!();};
 for(const text of [1,'x'.repeat(2049),'\ud800','\udfff','\u0000'.repeat(600)])expect(()=>app.clipboard.write(text as string)).toThrow();expect(sent.length).toBe(0);
 const write=app.clipboard.write('😀'.repeat(512));expect(sent.at(-1).kind).toBe('clipboard.write.v1');deliver(null);expect(await write.promise).toBeNull();
 const read=app.clipboard.read();let settled=false;read.promise.then(()=>{settled=true;});reply=JSON.stringify({v:1,id:sent.at(-1).id,ok:true,data:{text:'literal <img> 😀'}});await Promise.resolve();expect(settled).toBe(false);host.frame!();expect(await read.promise).toBe('literal <img> 😀');
 for(const data of [null,[],{text:1},{text:'ok',extra:true},{text:'x'.repeat(2049)}]){const work=app.clipboard.read(),failure=assert.rejects(work.promise,{code:'PROTOCOL'});deliver(data);await failure;}
 const malformed=app.clipboard.read(),rejected=assert.rejects(malformed.promise,{code:'CANCELLED'});expect(()=>deliver({text:'\ud800'})).toThrow('Invalid JSON reply');malformed.cancel();await rejected;
 for(const code of ['DENIED','BUSY','TIMEOUT','FAILED']){const work=app.clipboard.read(),failure=assert.rejects(work.promise,{code});reply=JSON.stringify({v:1,id:sent.at(-1).id,ok:false,error:{code,message:'Clipboard read rejected'}});host.frame!();await failure;}
 const pending=app.clipboard.read(),cancelled=assert.rejects(pending.promise,{code:'CANCELLED'});pending.cancel();await cancelled;expect(sent.at(-1).kind).toBe('cancel.v1');app.dispose();
});
