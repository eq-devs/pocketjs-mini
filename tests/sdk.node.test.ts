import { test } from "node:test";
import assert from "node:assert/strict";
import { FrameRuntime, utf8Bytes } from "../sdk/runtime.ts";
import { Navigation } from "../sdk/navigation.ts";

test("native replies wait for frame boundaries, FIFO events cannot reenter the current batch", async () => {
  const lines: string[] = [], runtime = new FrameRuntime({ send: line => lines.push(line) });
  const events: unknown[] = [];
  runtime.on("show", data => { events.push(data); if (data === 1) runtime.enqueue('{"v":1,"event":"show","data":2}'); });
  const work = runtime.request<number>("storage.get.v1");
  let resolved = false; work.promise.then(() => { resolved = true; });
  runtime.enqueue('{"v":1,"id":1,"ok":true,"data":42}');
  runtime.enqueue('{"v":1,"event":"show","data":1}');
  await Promise.resolve(); assert.equal(resolved, false);
  runtime.beginFrame(); assert.equal(await work.promise, 42); assert.deepEqual(events, [1]);
  runtime.beginFrame(); assert.deepEqual(events, [1, 2]);
  assert.equal(JSON.parse(lines[0]).kind, "storage.get.v1");
});
test("deadlines, cancellation, shutdown and host errors retain distinct codes", async () => {
  const runtime = new FrameRuntime({ send() {} }, { timeoutFrames: 2 });
  const timed = runtime.request("request.v1");
  const timeout = assert.rejects(timed.promise, { code: "TIMEOUT" });
  runtime.beginFrame(); runtime.beginFrame(); await timeout;
  const cancelled = runtime.request("request.v1");
  const cancel = assert.rejects(cancelled.promise, { code: "CANCELLED" }); cancelled.cancel(); await cancel;
  const denied = runtime.request("media.v1");
  const denial = assert.rejects(denied.promise, { code: "DENIED" });
  runtime.enqueue('{"v":1,"id":3,"ok":false,"error":{"code":"DENIED","message":"Permission denied"}}');
  runtime.beginFrame(); await denial;
  const closed = runtime.request("request.v1");
  const closure = assert.rejects(closed.promise, { code: "CLOSED" }); runtime.dispose(); await closure;
  assert.throws(() => runtime.request("request.v1"), { code: "CLOSED" });
});
test("protocol and capacity limits reject malformed, oversized and excess work", async () => {
  const native=new FrameRuntime({send(){throw Object.assign(new Error("Native queue full"),{code:"BUSY"});}});
  await assert.rejects(native.request("request.v1").promise,{code:"BUSY",message:"Native queue full"});
  const invalidNative=new FrameRuntime({send(){throw {code:"FAKE",message:"fixture"};}});
  await assert.rejects(invalidNative.request("request.v1").promise,{code:"FAILED"});
  const runtime = new FrameRuntime({ send() {} }, { maxPending: 1, maxQueued: 1, maxMessageBytes: 100 });
  assert.throws(() => runtime.request("request"), { code: "PROTOCOL" });
  assert.throws(() => runtime.request("request.v1", "x".repeat(100)), { code: "PROTOCOL" });
  const work = runtime.request("request.v1");
  assert.throws(() => runtime.request("request.v1"), { code: "BUSY" });
  for (const line of ['null', '{}', '{"v":2}', '{"v":1,"id":1,"ok":false}', 'invalid']) assert.throws(() => runtime.enqueue(line), { code: "PROTOCOL" });
  runtime.enqueue('{"v":1,"id":999,"ok":true}');
  assert.throws(() => runtime.enqueue('{"v":1,"id":1,"ok":true}'), { code: "BUSY" });
  runtime.beginFrame(); // Unknown replies do not complete another request.
  const cancellation = assert.rejects(work.promise, { code: "CANCELLED" }); work.cancel(); await cancellation;
  for (const [value, bytes] of [["ascii", 5], ["é", 2], ["汉", 3], ["😀", 4], ["\ud800", 3]] as const) assert.equal(utf8Bytes(value), bytes);
});
test("expiry and disposal cancel only outstanding native work and tolerate failed cleanup delivery", async () => {
  const sent: any[] = [];
  let failCancel = false;
  const runtime = new FrameRuntime({ send(line) {
    const record = JSON.parse(line); sent.push(record);
    if (failCancel && record.kind === "cancel.v1") throw new Error("retired mailbox");
  } }, { timeoutFrames: 1 });
  const completed = runtime.request("request.v1");
  const expired = runtime.request("request.v1");
  const expiry = assert.rejects(expired.promise, { code: "TIMEOUT" });
  runtime.enqueue('{"v":1,"id":1,"ok":true,"data":"done"}');
  runtime.beginFrame();
  assert.equal(await completed.promise, "done"); await expiry;
  expired.cancel(); // A later cancel must not send a second cleanup record.
  const a = runtime.request("request.v1"), b = runtime.request("media.v1");
  const closures = [assert.rejects(a.promise, { code: "CLOSED" }), assert.rejects(b.promise, { code: "CLOSED" })];
  failCancel = true;
  runtime.dispose(); runtime.dispose(); a.cancel(); b.cancel();
  await Promise.all(closures);
  assert.deepEqual(sent.filter(record => record.kind === "cancel.v1"), [2, 3, 4].map(id => ({ v: 1, id, kind: "cancel.v1", args: {} })));
  runtime.enqueue('{"v":1,"id":2,"ok":true,"data":"late"}');
  runtime.beginFrame(); // A late native completion cannot revive disposed work.
});
test("frame timers run once, can cancel each other, and failures do not lose subsequent effects", () => {
  const runtime = new FrameRuntime({ send() {} });
  const seen: string[] = [];
  runtime.after(1, () => { seen.push("first"); cancel(); throw new Error("fixture"); });
  const cancel = runtime.after(1, () => seen.push("cancelled"));
  runtime.after(1, () => seen.push("last"));
  assert.throws(() => runtime.beginFrame(), /fixture/);
  assert.deepEqual(seen, ["first", "last"]);
  runtime.beginFrame(); assert.deepEqual(seen, ["first", "last"]);
  assert.throws(() => runtime.after(0, () => {}), RangeError);
});
test("page navigation shares a guest, validates declared pages and delegates root back", () => {
  const nav = new Navigation(["/", "/detail", "/settings"], "/", 2);
  const updates: string[] = [];
  const unsubscribe = nav.subscribe(stack => updates.push(stack[stack.length - 1].path));
  const query = { id: "1" }; nav.push("/detail", query); query.id = "2";
  assert.equal(nav.current.query.id, "1");
  assert.throws(() => nav.push("/settings"), /limit/);
  assert.throws(() => nav.replace("/unknown"), /Undeclared/);
  nav.replace("/settings"); assert.equal(nav.back(), true); assert.equal(nav.back(), false);
  assert.deepEqual(updates, ["/detail", "/settings", "/"]);
  assert.throws(() => (nav.stack as any).push({ path: "/detail" }), TypeError);
  unsubscribe(); nav.push("/detail"); assert.equal(updates.length, 3);
});

test("navigation rejects oversized routes atomically and bounds subscriptions", () => {
  const nav = new Navigation(["/", "/detail"], "/", 32, 1);
  let updates = 0;
  const listener = () => updates++;
  const unsubscribe = nav.subscribe(listener);
  nav.subscribe(listener);
  assert.throws(() => nav.subscribe(() => {}), { code: "BUSY" });
  assert.throws(() => nav.subscribe(null as any), { code: "PROTOCOL" });
  const queries = [
    Object.fromEntries(Array.from({ length: 33 }, (_, n) => [`k${n}`, "v"])),
    { ["k".repeat(129)]: "v" },
    { k: "v".repeat(1025) },
    { a: "😀".repeat(512), b: "😀".repeat(512) },
    { invalid: "\ud800" },
  ];
  for (const query of queries) {
    for (const action of [() => nav.push("/detail", query), () => nav.replace("/detail", query), () => nav.reset("/detail", query)]) {
      assert.throws(action, { code: "PROTOCOL" });
      assert.equal(nav.stack.length, 1);
      assert.equal(nav.current.path, "/");
      assert.equal(updates, 0);
    }
  }
  unsubscribe();
  nav.subscribe(() => updates++);
  nav.push("/detail", { id: "valid" });
  assert.equal(updates, 1);
  assert.equal(nav.current.query.id, "valid");
});

test("mixed event and reply records cannot consume pending requests",async()=>{
 const runtime=new FrameRuntime({send(){}});let events=0;runtime.on('show',()=>events++);const request=runtime.request('fixture.v1');
 for(const record of [
  {v:1,id:1,ok:true,event:'show',data:42},
  {v:1,event:'show',ok:true,data:42},
  {v:1,id:1,ok:true,error:{code:'DENIED',message:'mixed'}},
  {v:1,id:1,ok:false,data:42,error:{code:'DENIED',message:'mixed'}},
  {v:1,id:1,ok:false,error:{code:'DENIED',message:'mixed',extra:true}},
  {v:1,id:1,ok:true,data:42,extra:true}
 ])assert.throws(()=>runtime.enqueue(JSON.stringify(record)),{code:'PROTOCOL'});
 runtime.enqueue('{"v":1,"id":1,"ok":true,"data":42}');runtime.beginFrame();assert.equal(await request.promise,42);assert.equal(events,0);runtime.dispose();
});

test('malformed completion batches preserve prior queue and pending requests',async()=>{
 const runtime=new FrameRuntime({send(){}},{maxQueued:3});const events:unknown[]=[];runtime.on('fixture',value=>events.push(value));
 let settled=false;const request=runtime.request('fixture.v1');request.promise.then(()=>{settled=true;});
 runtime.enqueue('{"v":1,"event":"fixture","data":"prior"}');
 assert.throws(()=>runtime.enqueueBatch(['{"v":1,"id":1,"ok":true,"data":"bad prefix"}','invalid']),{code:'PROTOCOL'});
 runtime.beginFrame();await Promise.resolve();assert.deepEqual(events,['prior']);assert.equal(settled,false);
 runtime.enqueueBatch(['{"v":1,"id":1,"ok":true,"data":"valid"}','{"v":1,"event":"fixture","data":"next"}']);runtime.beginFrame();assert.equal(await request.promise,'valid');assert.deepEqual(events,['prior','next']);runtime.dispose();
});

test('timer and listener quotas recover after cancellation and stale unsubscribe is harmless',()=>{
 const runtime=new FrameRuntime({send(){}},{maxTimers:2,maxListeners:2});let fired=0;
 const cancel=runtime.after(1,()=>fired++);runtime.after(1,()=>fired++);assert.throws(()=>runtime.after(1,()=>{}),{code:'BUSY'});cancel();runtime.after(1,()=>fired++);runtime.beginFrame();assert.equal(fired,2);runtime.after(1,()=>fired++);runtime.beginFrame();assert.equal(fired,3);
 const listener=()=>fired++;const stale=runtime.on('event',listener);stale();const remove=runtime.on('event',listener);stale();
 const second=runtime.on('second',()=>{});assert.throws(()=>runtime.on('third',()=>{}),{code:'BUSY'});runtime.on('event',listener);
 runtime.enqueue('{"v":1,"event":"event"}');runtime.beginFrame();assert.equal(fired,4);remove();second();runtime.on('third',()=>{});
 assert.throws(()=>runtime.on('',()=>{}),{code:'PROTOCOL'});assert.throws(()=>runtime.after(Number.MAX_SAFE_INTEGER,()=>{}),{code:'PROTOCOL'});runtime.dispose();
});

test('service listener disposal stops the remaining frame callbacks',()=>{
 const runtime=new FrameRuntime({send(){}});let calls=0;runtime.on('fixture',()=>runtime.dispose());runtime.on('fixture',()=>calls++);
 runtime.enqueue('{"v":1,"event":"fixture"}');runtime.beginFrame();assert.equal(calls,0);
});

test('unsafe request deadlines fail before sending or consuming an identifier',async()=>{
 const sent:string[]=[];const runtime=new FrameRuntime({send:line=>sent.push(line)});runtime.beginFrame();
 assert.throws(()=>runtime.request('fixture.v1',{},Number.MAX_SAFE_INTEGER),{code:'PROTOCOL'});assert.equal(sent.length,0);
 assert.throws(()=>{(runtime as any).currentFrame=0;},TypeError);assert.equal(runtime.currentFrame,1);
 const request=runtime.request('fixture.v1',{},1);assert.equal(JSON.parse(sent[0]).id,1);runtime.beginFrame();await assert.rejects(request.promise,{code:'TIMEOUT'});runtime.dispose();
});

test('native reply parsing rejects ambiguous JSON before frame admission',()=>{
 const runtime=new FrameRuntime({send(){}});
 for(const line of ['{"v":1,"id":1,"id":2,"ok":true}','{"v":1,"id":1,"\\u0069d":2,"ok":true}','{"v":1,"event":"test","data":"\\ud800"}','{"v":1,"event":"test","data":1e999}','\ufeff{"v":1,"event":"test"}','{"v":1,"event":"test","data":'+ '['.repeat(33)+'0'+']'.repeat(33)+'}'])assert.throws(()=>runtime.enqueue(line),{code:'PROTOCOL'});
 let events=0;runtime.on('test',()=>events++);runtime.enqueue('{"v":1,"event":"test"}');runtime.beginFrame();assert.equal(events,1);runtime.dispose();
});

test('outgoing requests reject non-native JSON before transport',async()=>{
 const sent:string[]=[];const runtime=new FrameRuntime({send:line=>sent.push(line)});
 let deep:unknown=0;for(let i=0;i<33;i++)deep=[deep];
 const cyclic:any={};cyclic.self=cyclic;
 for(const args of [{text:'\ud800'},{text:'\udfff'},deep,cyclic,{value:1n},{value:NaN},{value:Infinity},{value:undefined},{value:()=>{}},{value:Symbol('invalid')},new Array(1)])assert.throws(()=>runtime.request('fixture.v1',args),{code:'PROTOCOL'});assert.equal(sent.length,0);
 const request=runtime.request('fixture.v1',{text:'😀'});const id=JSON.parse(sent[0]).id;runtime.enqueue(JSON.stringify({v:1,id,ok:true,data:null}));runtime.beginFrame();assert.equal(await request.promise,null);runtime.dispose();
});
