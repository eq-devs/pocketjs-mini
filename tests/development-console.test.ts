import {test,expect} from "bun:test";
import {runInNewContext} from "node:vm";
import {developmentConsole} from "../bin/development-console.ts";
test("development console preserves host logging and emits bounded notifications",()=>{
 const original:unknown[][]=[],sent:any[]=[];const console={log:(...args:unknown[])=>original.push(args),warn:(...args:unknown[])=>original.push(args)};
 runInNewContext(developmentConsole,{console,ui:{svcOpen:()=>true,svcSend:(record:string)=>sent.push(JSON.parse(record))}});
 console.log("hello",123);console.warn("😀".repeat(1000));expect(original.length).toBe(2);expect(sent[0]).toEqual({v:1,kind:"debug.log.v1",args:{level:"info",message:"hello 123"}});expect(new TextEncoder().encode(sent[1].args.message).length).toBe(512);
});
test("development console tolerates missing or failed notification transport",()=>{
 let called=0;const console={log:()=>called++};runInNewContext(developmentConsole,{console,ui:{svcOpen:()=>{throw Error("closed");}}});expect(()=>console.log()).not.toThrow();expect(called).toBe(1);expect(()=>runInNewContext(developmentConsole,{})).not.toThrow();
});
