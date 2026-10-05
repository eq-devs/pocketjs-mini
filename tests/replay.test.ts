import {test,expect} from 'bun:test';
import {createHash} from 'node:crypto';
import {replayTape,type ReplayEngine} from '../devtools/replay.ts';
const payload=Buffer.from('replay fixture'),sha=createHash('sha256').update(payload).digest('hex');
const tape=Buffer.from(JSON.stringify({format:1,launchData:'{}',packageSha256:sha,target:'pjm-ios',window:{width:1,height:1,density:1},steps:[{kind:'completion',record:'{"v":1,"id":1,"ok":true,"data":null}'},{kind:'frame',contacts:[],hits:[],cancelled:[]},{kind:'lifecycle',event:'hide'},{kind:'frame',contacts:[],hits:[],cancelled:[]}]}));
function engine(changed=false){const calls:string[]=[];let frame=0;const adapter:ReplayEngine={boot(){calls.push('boot');},completion(){calls.push('completion');},lifecycle(event){calls.push(event);},frame(){calls.push('frame');return {pixels:new Uint8Array([0,0,0,changed?++frame:0]),effects:['effect']};},close(){calls.push('close');}};return {adapter,calls};}
test('replay snapshots input before clock and golden callbacks can mutate caller data',()=>{
 const source=Buffer.from(payload),records=Buffer.from(tape),provider=engine();let booted:Uint8Array|undefined;
 provider.adapter.boot=bytes=>{booted=bytes;provider.calls.push('boot');};
 const golden=replayTape(payload,tape,engine().adapter),mutable=golden.map(frame=>({...frame}));let reads=0;
 Object.defineProperty(mutable[0],'pixelsSha256',{enumerable:true,get(){reads++;return reads===1?golden[0].pixelsSha256:'0'.repeat(64);}});
 expect(replayTape(source,records,provider.adapter,mutable,undefined,undefined,{now:()=>{source.fill(0);records.fill(0);return 0;}})).toEqual(golden);
 expect(booted).toEqual(new Uint8Array(payload));expect(reads).toBe(1);expect(provider.calls.at(-1)).toBe('close');
});
test('total replay deadline stops following turns and closes the engine',()=>{
 let time=0;const provider=engine();const boot=provider.adapter.boot;
 provider.adapter.boot=(...args)=>{boot(...args);time=10;};
 expect(()=>replayTape(payload,tape,provider.adapter,undefined,undefined,undefined,{timeoutMs:10,now:()=>time})).toThrow('total deadline');
 expect(provider.calls).toEqual(['boot','close']);
 time=0;const slow=engine(),frame=slow.adapter.frame;
 slow.adapter.frame=(...args)=>{const result=frame(...args);time=20;return result;};
 expect(()=>replayTape(payload,tape,slow.adapter,undefined,undefined,undefined,{timeoutMs:10,now:()=>time})).toThrow('total deadline');
 expect(slow.calls).toEqual(['boot','completion','frame','close']);
 for(const timeoutMs of [0,-1,1.5,300001,Infinity])expect(()=>replayTape(payload,tape,engine().adapter,undefined,undefined,undefined,{timeoutMs})).toThrow('deadline');
 const clock=engine();let reads=0;
 expect(()=>replayTape(payload,tape,clock.adapter,undefined,undefined,undefined,{now:()=>++reads===1?10:9})).toThrow('monotonic clock');
 expect(clock.calls).toEqual(['close']);
});
test('replay preserves completion/lifecycle/frame order and checks all golden frames',()=>{
 const first=engine(),golden=replayTape(payload,tape,first.adapter);expect(first.calls).toEqual(['boot','completion','frame','hide','frame','close']);expect(golden.length).toBe(2);expect(Object.isFrozen(golden)).toBe(true);
 expect(replayTape(payload,tape,engine().adapter,golden)).toEqual(golden);
 const divergent=engine(true);expect(()=>replayTape(payload,tape,divergent.adapter,golden)).toThrow('frame 1');expect(divergent.calls).toEqual(['boot','completion','frame','close']);
 const partial=engine();expect(()=>replayTape(payload,tape,partial.adapter,golden.slice(0,1))).toThrow('every frame');expect(partial.calls).toEqual(['close']);
 const mismatched=engine();expect(()=>replayTape(Buffer.from('changed'),tape,mismatched.adapter)).toThrow('package');expect(mismatched.calls).toEqual(['close']);
});

test('selected frame capture snapshots pixels and validates frame selection before boot',()=>{
 const provider=engine(),captures:unknown[]=[];replayTape(payload,tape,provider.adapter,undefined,{frame:2,receive:(pixels,width,height)=>{captures.push([pixels.length,width,height]);pixels.fill(255);}});expect(captures).toEqual([[4,1,1]]);
 const invalid=engine();expect(()=>replayTape(payload,tape,invalid.adapter,undefined,{frame:3,receive:()=>{}})).toThrow('outside tape');expect(invalid.calls).toEqual(['close']);
});
test('tree capture occurs at the selected frame and rejects unavailable capability before boot',()=>{
 const provider=engine();provider.adapter.inspectTree=()=>{provider.calls.push('inspect');return Buffer.from(JSON.stringify({format:1,nodes:[{id:1,parent:0,type:1,text:'guest',children:[],layout:null}]}));};let text='';
 replayTape(payload,tape,provider.adapter,undefined,undefined,{frame:2,receive:tree=>{text=tree.nodes[0].text;}});expect(text).toBe('guest');expect(provider.calls).toEqual(['boot','completion','frame','hide','frame','inspect','close']);
 const missing=engine();expect(()=>replayTape(payload,tape,missing.adapter,undefined,undefined,{frame:1,receive:()=>{}})).toThrow('capability');expect(missing.calls).toEqual(['close']);
});
test('replay retains first divergence alongside cleanup errors and closes once',()=>{
 const golden=replayTape(payload,tape,engine().adapter),provider=engine(true),cleanup=Error('cleanup failed');let closes=0;
 provider.adapter.close=()=>{closes++;throw cleanup;};
 let failure:unknown;try{replayTape(payload,tape,provider.adapter,golden);}catch(error){failure=error;}
 expect(failure).toBeInstanceOf(AggregateError);
 const combined=failure as AggregateError;expect(combined.message).toBe('Replay diverged at frame 1');expect(combined.errors[1]).toBe(cleanup);expect(combined.cause).toBe(combined.errors[0]);expect(closes).toBe(1);
 const successful=engine();successful.adapter.close=()=>{throw cleanup;};expect(()=>replayTape(payload,tape,successful.adapter)).toThrow(cleanup);
 const malformed=engine();expect(()=>replayTape(payload,Buffer.from('{}'),malformed.adapter)).toThrow();expect(malformed.calls).toEqual(['close']);
});
