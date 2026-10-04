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
