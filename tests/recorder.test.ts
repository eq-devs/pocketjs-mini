import {test,expect} from 'bun:test';
import {TapeRecorder} from '../devtools/recorder.ts';
import {decodeNativeTape} from '../devtools/tape.ts';
test('recorder snapshots input and completion order for the originating package',()=>{
 const payload=Buffer.from('original package'),window={width:360,height:598,density:3},recorder=new TapeRecorder(payload,'pjm-ios',window,'{"query":{"page":"detail"}}');
 window.width=900;payload.fill(0);
 const contacts=[1],hits=[-1];recorder.append({kind:'completion',record:'{"v":1,"id":1,"ok":true,"data":null}'});recorder.append({kind:'frame',contacts,hits,cancelled:[]});contacts[0]=5;hits[0]=99;
 recorder.append({kind:'lifecycle',event:'hide'});const result=decodeNativeTape(recorder.finish());expect(result.window.width).toBe(360);expect(result.launchData).toBe('{"query":{"page":"detail"}}');expect(result.steps.map(step=>step.kind)).toEqual(['completion','frame','lifecycle']);expect((result.steps[1] as any).contacts).toEqual([1]);expect((result.steps[1] as any).hits).toEqual([-1]);expect(()=>recorder.append({kind:'frame',contacts:[],hits:[],cancelled:[]})).toThrow('stopped');
});
test('recording rejects malformed records without consuming a slot and stops at capacity',()=>{
 const recorder=new TapeRecorder(Buffer.from('package'),'pjm-android',{width:1,height:1,density:1});
 expect(()=>recorder.finish()).toThrow('no frames');expect(()=>recorder.append({kind:'completion',record:'{"v":1,"id":1,"id":2,"ok":true}'})).toThrow();expect(recorder.stepCount).toBe(0);
 const frame={kind:'frame' as const,contacts:[],hits:[],cancelled:[]};for(let index=0;index<36000;index++)recorder.append(frame);expect(()=>recorder.append(frame)).toThrow('capacity');expect(decodeNativeTape(recorder.finish()).steps.length).toBe(36000);
});
