import { test } from "node:test";
import assert from "node:assert/strict";
import { connectMiniApp, type FrameHost } from "../sdk/native.ts";
test("native SDK replies enter cached frames, preserve errors and isolate reconnected clients", async () => {
  const sent: string[] = [], order: string[] = [];
  let replies = "";
  const original = () => order.push("framework");
  const host: FrameHost = { frame: original, ui: { svcOpen: name => name === "mini", svcSend: line => sent.push(line), svcPoll: () => {const value=replies;replies="";return value;} } };
  const app = connectMiniApp({ host, pages: ["/", "/detail"] });
  assert.throws(() => connectMiniApp({ host }), { code: "BUSY" });
  const request = app.deviceInfo();
  assert.equal(JSON.parse(sent[0]).kind, "device.info.v1");
  replies=JSON.stringify({v:1,id:1,ok:true,data:{platform:"android"}})+"\n";
  app.after(1, () => order.push("timer"));
  host.frame!();
  assert.deepEqual(await request.promise, {platform:"android"});
  assert.deepEqual(order,["timer","framework"]);
  app.navigation.push("/detail");assert.equal(app.navigation.back(),true);
  const pending=app.deviceInfo();const closed=assert.rejects(pending.promise,{code:"CLOSED"});app.dispose();await closed;
  const cachedNativeFrame=host.frame!;
  cachedNativeFrame();assert.equal(order[order.length-1],"framework");
  const replacement=connectMiniApp({host});const fresh=replacement.deviceInfo();
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
