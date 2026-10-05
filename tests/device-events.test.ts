import {test,expect} from "bun:test";
import {DeviceEvents,boundedEvent} from "../bin/device-events.ts";
test("device event validation and streamed byte bounds",async()=>{
 const events=new DeviceEvents();for(let revision=1;revision<=40;revision++)events.accept({revision,platform:"android",kind:"frame-ready"},40);expect(events.snapshot().length).toBe(32);expect(events.snapshot()[0].revision).toBe(9);
 for(const value of [{revision:41,platform:"ios",kind:"frame-ready"},{revision:1,platform:"web",kind:"frame-ready"},{revision:1,platform:"ios",kind:"frame-ready",extra:1}])expect(()=>events.accept(value,40)).toThrow();
 expect(await boundedEvent(new Request("http://localhost",{method:"POST",body:'{"revision":1}'}))).toEqual({revision:1});await expect(boundedEvent(new Request("http://localhost",{method:"POST",body:"x".repeat(4097)}))).rejects.toThrow();
});

test("device log records enforce levels and UTF-8 byte limits",()=>{
 const events=new DeviceEvents();events.accept({revision:1,platform:"ios",kind:"log",level:"warn",message:"😀".repeat(512)},1);expect(events.snapshot()[0].message?.length).toBe(1024);expect(Object.isFrozen(events.snapshot()[0])).toBe(true);
 for(const record of [{level:"trace",message:"x"},{level:"info",message:"😀".repeat(513)},{level:"error",message:5}])expect(()=>events.accept({revision:1,platform:"android",kind:"log",...record},1)).toThrow();
});
