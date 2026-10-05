import {test,expect} from "bun:test";
import {BuildHistory} from "../bin/build-history.ts";
test("build diagnostics retain bounded immutable history and UTF-8 messages",()=>{
 const history=new BuildHistory();for(let i=1;i<=40;i++)history.record(i,"failed",1.6,"😀".repeat(1000));
 const snapshot=history.snapshot();expect(snapshot.length).toBe(32);expect(snapshot[0].revision).toBe(9);expect(snapshot[0].durationMs).toBe(2);expect(new TextEncoder().encode(snapshot[0].message).length).toBe(2048);expect(Object.isFrozen(snapshot)).toBe(true);expect(Object.isFrozen(snapshot[0])).toBe(true);
 history.record(41,"published",0);expect(snapshot.length).toBe(32);expect(snapshot.at(-1)?.revision).toBe(40);expect(()=>history.record(0,"failed",0)).toThrow();expect(()=>history.record(42,"failed",Infinity)).toThrow();
});
test("overlapping compiler stages remain bounded independent snapshots",()=>{
 const history=new BuildHistory(),stages={resolveMs:1,typeCheckMs:800,prepareMs:1,compilerMs:810,packageMs:2};history.record(1,"published",814,undefined,stages);stages.typeCheckMs=0;
 expect(history.snapshot()[0].stages?.typeCheckMs).toBe(800);expect(Object.isFrozen(history.snapshot()[0].stages)).toBe(true);
 expect(()=>history.record(2,"published",1,undefined,{compilerMs:-1})).toThrow();expect(()=>history.record(2,"published",1,undefined,{unknown:1})).toThrow();
});
