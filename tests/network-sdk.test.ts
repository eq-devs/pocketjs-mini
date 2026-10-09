import {test,expect} from 'bun:test';
import assert from 'node:assert/strict';
import {connectMiniApp,type FrameHost} from '../sdk/native.ts';
import {checkedNetworkState} from '../sdk/network.ts';

test('network SDK validates native path snapshots and delivers changed state only on frames',async()=>{
 const sent:any[]=[];let reply='';const host:FrameHost={frame(){},ui:{svcOpen:()=>true,svcSend:line=>sent.push(JSON.parse(line)),svcPoll:()=>{const line=reply;reply='';return line;}}};
 const app=connectMiniApp({host,limits:{maxListeners:1}}),states:unknown[]=[];
 const watch=app.network.watch(value=>states.push(value));expect(sent.at(-1).kind).toBe('device.network.v1');expect(sent.at(-1).args).toEqual({});
 expect(()=>app.network.watch(()=>{})).toThrow();expect(sent.length).toBe(1);
 const unknown={connected:null,type:'unknown',expensive:null};
 reply=JSON.stringify({v:1,id:sent.at(-1).id,ok:true,data:unknown});host.frame!();expect(await watch.promise).toEqual(unknown);
 const wifi={connected:true,type:'wifi',expensive:false};reply=JSON.stringify({v:1,event:'device.network.v1',data:wifi});expect(states).toEqual([]);host.frame!();expect(states).toEqual([wifi]);expect(Object.isFrozen(states[0])).toBe(true);
 watch.cancel();watch.cancel();reply=JSON.stringify({v:1,event:'device.network.v1',data:{connected:false,type:'none',expensive:null}});host.frame!();expect(states).toEqual([wifi]);
 const read=app.network.get(),failure=assert.rejects(read.promise,{code:'PROTOCOL'});reply=JSON.stringify({v:1,id:sent.at(-1).id,ok:true,data:{connected:false,type:'wifi',expensive:false}});host.frame!();await failure;
 const rejected=app.network.watch(()=>{}),unsupported=assert.rejects(rejected.promise,{code:'UNSUPPORTED'});reply=JSON.stringify({v:1,id:sent.at(-1).id,ok:false,error:{code:'UNSUPPORTED',message:'No network service'}});host.frame!();await unsupported;
 const next=app.network.watch(()=>{}),cancelled=assert.rejects(next.promise,{code:'CANCELLED'});next.cancel();await cancelled;expect(sent.at(-1).kind).toBe('cancel.v1');app.dispose();expect(()=>app.network.get()).toThrow();
});
test('network state accepts unknown/offline/native transports and rejects ambiguous states',()=>{
 for(const value of [{connected:null,type:'unknown',expensive:null},{connected:false,type:'none',expensive:null},...['wifi','cellular','ethernet','other'].map(type=>({connected:true,type,expensive:true}))])expect(checkedNetworkState(value)).toEqual(value);
 for(const value of [null,[],{}, {connected:true,type:'wifi',expensive:false,extra:1},{connected:true,type:'unknown',expensive:false},{connected:null,type:'none',expensive:null},{connected:false,type:'none',expensive:false},{connected:1,type:'wifi',expensive:false},{connected:true,type:'wifi',expensive:null}])expect(()=>checkedNetworkState(value)).toThrow();
});
