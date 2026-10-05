import { test } from "node:test";
import assert from "node:assert/strict";
import { connectMiniApp, type FrameHost } from "../sdk/native.ts";
test("typed HTTP validates bounded inline requests and frame-delivered replies while preserving cancellation", async () => {
  const sent: any[]=[];let reply="";
  const host:FrameHost={frame(){},ui:{svcOpen(){return true;},svcSend(line){sent.push(JSON.parse(line));},svcPoll(){const line=reply;reply="";return line;}}};
  const app=connectMiniApp({host});
  for(const args of [null,[],{url:"http://example.com/"},{url:"https://example.com/",method:null},{url:"https://example.com/",headers:null},{url:"https://example.com/",bodyBase64:null},
    {url:"https://example.com/",method:"POST",bodyBase64:"Zh=="},{url:"https://example.com/",method:"POST",bodyBase64:"Zm9="},{url:"https://example.com/",method:"POST",bodyBase64:"AAAA".repeat(513)},
    {url:"https://example.com/",bodyBase64:"Zg=="},{url:"https://example.com/",headers:{Cookie:"secret"}},{url:"https://example.com/",headers:{Accept:"a",accept:"b"}},
    {url:"https://example.com/",headers:{Accept:"a\r\nb"}},{url:"https://example.com/",headers:{Accept:"é"}},{url:"https://example.com/",unexpected:1}])assert.throws(()=>app.http(args as any),{code:"PROTOCOL"});
  assert.equal(sent.length,0);
  const headers={Accept:"application/json"}, work=app.http({url:"https://example.com/",method:"POST",headers,bodyBase64:"Zg=="});headers.Accept="changed";
  assert.equal(sent[0].kind,"request.v1");assert.equal(sent[0].args.headers.Accept,"application/json");
  let settled=false;work.promise.then(()=>{settled=true;});reply=JSON.stringify({v:1,id:sent[0].id,ok:true,data:{status:200,bodyBase64:"aGVsbG8="}});
  await Promise.resolve();assert.equal(settled,false);host.frame!();const result=await work.promise;assert.deepEqual(result,{status:200,bodyBase64:"aGVsbG8="});assert.ok(Object.isFrozen(result));
  for(const data of [{status:99,bodyBase64:""},{status:600,bodyBase64:""},{status:200},{status:200,bodyBase64:"Zh=="},{status:200,bodyBase64:"AAAA".repeat(513)}]){
    const invalid=app.http({url:"https://example.com/"});const rejection=assert.rejects(invalid.promise,{code:"PROTOCOL"});reply=JSON.stringify({v:1,id:sent[sent.length-1].id,ok:true,data});host.frame!();await rejection;
  }
  const maximum=app.http({url:"https://example.com/",method:"POST",bodyBase64:"AAAA".repeat(512)});const cancellation=assert.rejects(maximum.promise,{code:"CANCELLED"});const id=sent[sent.length-1].id;maximum.cancel();await cancellation;assert.deepEqual(sent[sent.length-1],{v:1,id,kind:"cancel.v1",args:{}});
  app.dispose();
});
test("native SDK replies enter cached frames, preserve errors and isolate reconnected clients", async () => {
  const sent: string[] = [], order: string[] = [];
  let replies = "";
  const original = () => order.push("framework");
  const host: FrameHost = { frame: original, ui: { svcOpen: name => name === "mini", svcSend: line => sent.push(line), svcPoll: () => {const value=replies;replies="";return value;} } };
  const app = connectMiniApp({ host, pages: ["/", "/detail"] });
  assert.throws(() => connectMiniApp({ host }), { code: "BUSY" });
  const request = app.deviceInfo();
  assert.equal(JSON.parse(sent[0]).kind, "device.info.v1");
  const device={platform:"android",model:"fixture",width:64,height:64,density:1,safeTop:0,safeBottom:0,safeLeft:0,safeRight:0};
  replies=JSON.stringify({v:1,id:1,ok:true,data:device})+"\n";
  app.after(1, () => order.push("timer"));
  host.frame!();
  assert.deepEqual(await request.promise, device);
  assert.deepEqual(order,["timer","framework"]);
  app.navigation.push("/detail");assert.equal(app.navigation.back(),true);
  const pending=app.deviceInfo();const closed=assert.rejects(pending.promise,{code:"CLOSED"});app.dispose();await closed;
  assert.deepEqual(JSON.parse(sent[sent.length-1]),{v:1,id:2,kind:"cancel.v1",args:{}});
  const cachedNativeFrame=host.frame!;
  cachedNativeFrame();assert.equal(order[order.length-1],"framework");
  const replacement=connectMiniApp({host});const fresh=replacement.request<string>("test.echo.v1");
  const freshId=JSON.parse(sent[sent.length-1]).id;assert.equal(freshId,3);
  replies=JSON.stringify({v:1,id:2,ok:true,data:"stale"})+"\n"+JSON.stringify({v:1,id:freshId,ok:true,data:"fresh"})+"\n";
  assert.equal(host.frame,cachedNativeFrame);
  cachedNativeFrame();assert.equal(await fresh.promise,"fresh");replacement.dispose();
  const unavailable=connectMiniApp({host:{frame(){}}});
  await assert.rejects(unavailable.deviceInfo().promise,{code:"UNSUPPORTED"});unavailable.dispose();
  assert.throws(() => connectMiniApp({host:{}}),{code:"PROTOCOL"});
  assert.throws(() => connectMiniApp({host:{frame(){}},limits:{maxMessageBytes:4097}}),{code:"PROTOCOL"});
});

test("lifecycle hooks preserve frame timers and reconnect without stale listeners", () => {
  const events: string[]=[];
  const original=(event: string)=>events.push(`previous:${event}`);
  const host: FrameHost={frame(){},__miniLifecycle:original};
  const app=connectMiniApp({host});
  const remove=app.onLifecycle("show",()=>events.push("show"));
  app.after(1,()=>events.push("timer"));
  host.__miniLifecycle!("show");
  assert.equal(app.runtime.currentFrame,0);
  assert.deepEqual(events,["previous:show","show"]);
  remove();host.__miniLifecycle!("show");
  assert.deepEqual(events,["previous:show","show","previous:show"]);
  host.frame!();assert.equal(events.at(-1),"timer");
  app.dispose();assert.equal(host.__miniLifecycle,original);
  assert.throws(()=>app.onLifecycle("hide",()=>{}),{code:"CLOSED"});
  const next=connectMiniApp({host});next.onLifecycle("hide",()=>events.push("next"));
  host.__miniLifecycle!("hide");assert.deepEqual(events.slice(-2),["previous:hide","next"]);
  next.dispose();assert.equal(host.__miniLifecycle,original);
});

test("launch parameters are immutable snapshots and reject malformed queries",()=>{
  const host:FrameHost={frame(){}};
  const app=connectMiniApp({host,pages:["/","/detail"]});
  let delivered:unknown;
  app.onLifecycle("launch",data=>{delivered=data;});
  const data={source:"qr",path:"/detail",query:{id:"123"}};
  host.__miniLifecycle!("launch",data);
  data.query.id="changed";
  assert.deepEqual(delivered,{source:"qr",path:"/detail",query:{id:"123"}});
  assert.equal(app.launchOptions,delivered);
  assert.equal(app.navigation.current.path,"/detail");
  assert.deepEqual(app.navigation.current.query,{id:"123"});
  assert.equal(app.navigation.back(),false,"Launch destination must be the root page");
  assert.ok(Object.isFrozen(app.launchOptions?.query));
  assert.throws(()=>host.__miniLifecycle!("launch",{query:{id:1}}),{code:"PROTOCOL"});
  assert.throws(()=>host.__miniLifecycle!("launch",{source:"qr",path:"/undeclared",query:{}}),{code:"PROTOCOL"});
  assert.throws(()=>host.__miniLifecycle!("launch",{source:"qr",path:"/",query:{a:"😀".repeat(1000),b:"😀".repeat(1000)}}),{code:"PROTOCOL"});
  assert.equal(app.navigation.current.path,"/detail");
  assert.equal(app.launchOptions,delivered);
  app.dispose();
});

test("development launch without a path uses the configured entry",()=>{
  const host:FrameHost={frame(){}};
  const app=connectMiniApp({host,pages:["/home"],entry:"/home"});
  host.__miniLifecycle!("launch",{source:"development",query:{}});
  assert.equal(app.navigation.current.path,"/home");
  assert.equal(app.launchOptions?.path,"/home");
  app.dispose();
});

test("reconnection retains launch context and page stack within one guest",()=>{
  const host:FrameHost={frame(){}};
  const first=connectMiniApp({host,pages:["/home","/detail"],entry:"/home"});
  let oldShows=0;first.onLifecycle("show",()=>oldShows++);
  host.__miniLifecycle!("launch",{source:"qr",path:"/home",query:{id:"launch"}});
  first.navigation.push("/detail",{id:"current"});
  const snapshot=first.launchOptions;
  first.dispose();
  assert.throws(()=>connectMiniApp({host,pages:["/"]}),{code:"PROTOCOL"});
  const next=connectMiniApp({host});
  assert.equal(next.launchOptions,snapshot);
  assert.equal(next.navigation,first.navigation);
  assert.deepEqual(next.navigation.current,{path:"/detail",query:{id:"current"}});
  host.__miniLifecycle!("show");assert.equal(oldShows,0);
  assert.equal(next.navigation.back(),true);
  assert.deepEqual(next.navigation.current,{path:"/home",query:{id:"launch"}});
  next.dispose();
  const other=connectMiniApp({host:{frame(){}}});
  assert.equal(other.launchOptions,undefined);assert.equal(other.navigation.current.path,"/");other.dispose();
});

test("invalid first launch preserves entry and allows a later valid launch",()=>{
  for(const data of [{query:{id:1}},{source:"qr",path:"/undeclared",query:{}},{source:"qr",path:"/",query:{a:"😀".repeat(1000),b:"😀".repeat(1000)}}]){
    const host:FrameHost={frame(){}};const app=connectMiniApp({host});
    assert.throws(()=>host.__miniLifecycle!("launch",data),{code:"PROTOCOL"});
    assert.equal(app.launchOptions,undefined);assert.equal(app.navigation.current.path,"/");
    host.__miniLifecycle!("launch",{source:"qr",path:"/",query:{id:"valid"}});
    assert.equal(app.launchOptions?.query.id,"valid");
    assert.throws(()=>host.__miniLifecycle!("launch",{source:"qr",path:"/",query:{}}),{code:"PROTOCOL"});
    assert.equal(app.launchOptions?.query.id,"valid");app.dispose();
  }
});

test("device info validates the complete native contract and returns an immutable snapshot",async()=>{
  let sent="",reply="";const host:FrameHost={frame(){},ui:{svcOpen:()=>true,svcSend:line=>{sent=line;},svcPoll:()=>{const value=reply;reply="";return value;}}};const app=connectMiniApp({host});
  const valid={platform:"ios",model:"fixture",width:64,height:64,density:2,safeTop:1.5,safeBottom:2,safeLeft:0,safeRight:0};
  for(const value of [{platform:"ios"},{...valid,width:0},{...valid,density:5},{...valid,width:1024,height:1024,density:4},{...valid,safeTop:-1},{...valid,safeBottom:64},{...valid,safeRight:"0"},{...valid,model:"x".repeat(257)}]){
    const request=app.deviceInfo(),failure=assert.rejects(request.promise,{code:"PROTOCOL"});reply=JSON.stringify({v:1,id:JSON.parse(sent).id,ok:true,data:value});host.frame!();await failure;
  }
  for(const accepted of [valid,{...valid,width:1024,height:1024,density:2}]){
    const request=app.deviceInfo();reply=JSON.stringify({v:1,id:JSON.parse(sent).id,ok:true,data:accepted});host.frame!();const result=await request.promise;assert.deepEqual(result,accepted);assert.ok(Object.isFrozen(result));
  }
  app.dispose();
});

test("resource SDK binds response modes and validates chunk ranges and cancellation",async()=>{
  const sent:any[]=[];let reply="";
  const host:FrameHost={frame(){},ui:{svcOpen:()=>true,svcSend:line=>sent.push(JSON.parse(line)),svcPoll:()=>{const value=reply;reply="";return value;}}};
  const app=connectMiniApp({host}),handle="r_"+"a".repeat(32);
  const deliver=(data:unknown)=>{reply=JSON.stringify({v:1,id:sent[sent.length-1].id,ok:true,data});host.frame!();};
  const args={url:"https://example.com/",responseMode:"resource" as "resource"|"inline"},http=app.http(args);args.responseMode="inline";
  deliver({status:200,resource:{handle,size:1537}});assert.deepEqual(await http.promise,{status:200,resource:{handle,size:1537}});
  for(const value of [null,{handle:"../file",offset:0,count:1},{handle,offset:-1,count:1},{handle,offset:0,count:1537},{handle,offset:0.5,count:1},{handle,offset:0,count:1,extra:1}])assert.throws(()=>app.resources.read(value as any),{code:"PROTOCOL"});
  for(const data of [{bodyBase64:"Zg==",offset:1,nextOffset:2,size:2,eof:true},{bodyBase64:"Zh==",offset:0,nextOffset:1,size:1,eof:true},{bodyBase64:"Zg==",offset:0,nextOffset:2,size:2,eof:true},{bodyBase64:"",offset:0,nextOffset:0,size:1,eof:false},{bodyBase64:"Zg==",offset:0,nextOffset:1,size:1,eof:false},{bodyBase64:"Zg==",offset:0,nextOffset:1,size:1,eof:1},{bodyBase64:"Zg==",offset:0,nextOffset:1,size:1,eof:true,extra:1}]){
    const work=app.resources.read({handle,offset:0,count:1}),failure=assert.rejects(work.promise,{code:"PROTOCOL"});deliver(data);await failure;
  }
  const read=app.resources.read({handle,offset:1536,count:1536});deliver({bodyBase64:"Zg==",offset:1536,nextOffset:1537,size:1537,eof:true});const chunk=await read.promise;assert.ok(Object.isFrozen(chunk));assert.equal(chunk.nextOffset,1537);
  const eof=app.resources.read({handle,offset:1537,count:1});deliver({bodyBase64:"",offset:1537,nextOffset:1537,size:1537,eof:true});assert.equal((await eof.promise).eof,true);
  const release=app.resources.release(handle);assert.equal(sent[sent.length-1].kind,"resource.release.v1");deliver(null);assert.equal(await release.promise,null);
  const invalidRelease=app.resources.release(handle),failure=assert.rejects(invalidRelease.promise,{code:"PROTOCOL"});deliver({});await failure;
  const cancelled=app.resources.read({handle,offset:0,count:1}),rejection=assert.rejects(cancelled.promise,{code:"CANCELLED"}),id=sent[sent.length-1].id;cancelled.cancel();await rejection;assert.deepEqual(sent[sent.length-1],{v:1,id,kind:"cancel.v1",args:{}});
  for(const data of [{status:200,bodyBase64:""},{status:200,resource:{handle:"r_bad",size:1}},{status:200,resource:{handle,size:1048577}},{status:200,resource:{handle,size:1},bodyBase64:""},{status:200,resource:{handle,size:1,extra:1}},{status:200,resource:{handle,size:1},extra:1}]){
    const request=app.http({url:"https://example.com/",responseMode:"resource"}),failure=assert.rejects(request.promise,{code:"PROTOCOL"});deliver(data);await failure;
  }
  app.dispose();
});

test('native completion batches are bounded before queue mutation',async()=>{
 let reply='',sent:any;const host:FrameHost={frame(){},ui:{svcOpen:()=>true,svcSend:line=>{sent=JSON.parse(line);},svcPoll:()=>{const value=reply;reply='';return value;}}};
 assert.throws(()=>connectMiniApp({host,limits:{maxQueued:33}}),{code:'PROTOCOL'});
 const app=connectMiniApp({host}),request=app.request('fixture.v1');assert.equal(Object.isFrozen(app.runtime.limits),true);
 reply='\n'.repeat(32*4097+1);assert.throws(()=>host.frame!(),{code:'PROTOCOL'});
 reply=Array.from({length:33},()=>JSON.stringify({v:1,event:'fixture',data:null})).join('\n');assert.throws(()=>host.frame!(),{code:'BUSY'});
 reply=JSON.stringify({v:1,id:sent.id,ok:true,data:42});host.frame!();assert.equal(await request.promise,42);app.dispose();
});

test('lifecycle listener capacity recovers and disposal stops remaining callbacks',()=>{
 const host:FrameHost={frame(){}};const app=connectMiniApp({host,limits:{maxListeners:2}});let calls=0;const listener=()=>calls++;
 const stale=app.onLifecycle('show',listener);stale();const remove=app.onLifecycle('show',listener);stale();app.onLifecycle('hide',()=>{});
 assert.throws(()=>app.onLifecycle('memoryWarning',()=>{}),{code:'BUSY'});app.onLifecycle('show',listener);host.__miniLifecycle!('show');assert.equal(calls,1);remove();
 app.onLifecycle('show',()=>app.dispose());host.__miniLifecycle!('show');assert.equal(calls,1);
 const next=connectMiniApp({host,limits:{maxListeners:2}});next.onLifecycle('show',()=>next.dispose());next.onLifecycle('show',()=>calls++);host.__miniLifecycle!('show');assert.equal(calls,1);
});

test('storage SDK validates keys, values and acknowledgements at frame boundaries',async()=>{
 const sent:any[]=[];let reply='';const host:FrameHost={frame(){},ui:{svcOpen:()=>true,svcSend:line=>sent.push(JSON.parse(line)),svcPoll:()=>{const value=reply;reply='';return value;}}};const app=connectMiniApp({host});
 for(const key of ['', '😀'.repeat(33),'\ud800'])assert.throws(()=>app.storage.get(key),{code:'PROTOCOL'});
 for(const value of [undefined,NaN,'x'.repeat(2047),'\ud800'])assert.throws(()=>app.storage.set('key',value),{code:'PROTOCOL'});assert.equal(sent.length,0);
 const set=app.storage.set('😀'.repeat(32),'x'.repeat(2046));reply=JSON.stringify({v:1,id:sent.at(-1).id,ok:true,data:null});host.frame!();assert.equal(await set.promise,null);
 const get=app.storage.get('key'),failure=assert.rejects(get.promise,{code:'PROTOCOL'});reply=JSON.stringify({v:1,id:sent.at(-1).id,ok:true,data:'x'.repeat(2047)});host.frame!();await failure;
 const remove=app.storage.remove('key'),badAck=assert.rejects(remove.promise,{code:'PROTOCOL'});reply=JSON.stringify({v:1,id:sent.at(-1).id,ok:true,data:true});host.frame!();await badAck;app.dispose();
});
