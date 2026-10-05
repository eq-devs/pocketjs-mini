import {test,expect} from 'bun:test';
import {encodeReplayGolden,decodeReplayGolden} from '../devtools/golden.ts';
const tape=()=>({format:1,launchData:'{}',packageSha256:'a'.repeat(64),target:'pjm-ios',window:{width:1,height:1,density:1},steps:[{kind:'frame',contacts:[],hits:[],cancelled:[]}]});
const bytes=(value:any)=>Buffer.from(JSON.stringify(value));
const frames=[{frame:1,pixelsSha256:'b'.repeat(64),effectsSha256:'c'.repeat(64)}];
test('saved replay golden binds original tape/package and snapshots complete results',()=>{
 const recording=bytes(tape()),encoded=encodeReplayGolden(recording,frames),decoded=decodeReplayGolden(encoded,recording);expect(decoded).toEqual(frames);expect(Object.isFrozen(decoded[0])).toBe(true);
 expect(()=>decodeReplayGolden(encoded,bytes({...tape(),launchData:'{"query":{"page":"other"}}'}))).toThrow('original tape');
 expect(()=>encodeReplayGolden(recording,[])).toThrow('every tape frame');
 const candidate=JSON.parse(Buffer.from(encoded).toString());for(const patch of [{extra:true},{format:2},{packageSha256:'d'.repeat(64)},{frames:[{...frames[0],frame:2}]},{frames:[{...frames[0],pixelsSha256:'bad'}]}])expect(()=>decodeReplayGolden(bytes({...candidate,...patch}),recording)).toThrow();
 expect(()=>decodeReplayGolden(Buffer.alloc(8*1024*1024+1),recording)).toThrow('byte limit');
});
