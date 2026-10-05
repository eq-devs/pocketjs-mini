import {test,expect} from 'bun:test';
import {decodeNativeTape} from '../devtools/tape.ts';
const tape=()=>({format:1,launchData:'{}',packageSha256:'a'.repeat(64),target:'pjm-ios',window:{width:360,height:598,density:3},steps:[{kind:'completion',record:'{"v":1,"id":1,"ok":true,"data":null}'},{kind:'frame',contacts:[1],hits:[-1],cancelled:[]},{kind:'lifecycle',event:'hide'}]});
const decode=(value:any)=>decodeNativeTape(new TextEncoder().encode(JSON.stringify(value)));
test('native tape preserves original completion/input order and immutable package identity',()=>{const value=decode(tape());expect(value.steps.map(step=>step.kind)).toEqual(['completion','frame','lifecycle']);expect(Object.isFrozen(value.steps)).toBe(true);expect(Object.isFrozen((value.steps[1] as any).contacts)).toBe(true);});
test('native tape rejects incompatible and unbounded inputs before replay',()=>{
 expect(()=>decode({...tape(),window:{width:1025,height:1,density:1}})).toThrow();
 expect(()=>decode({...tape(),steps:[{kind:'lifecycle',event:'back'},...tape().steps]})).toThrow();
 expect(decode({...tape(),steps:[{kind:'lifecycle',event:'memoryWarning'},...tape().steps]}).steps[0].kind).toBe('lifecycle');
 const patches=[{launchData:'[]'},{launchData:'{"query":1,"query":2}'},{launchData:'x'.repeat(4097)},{format:2},{target:'web'},{packageSha256:'bad'},{extra:true},{steps:[]},{window:{width:2048,height:2048,density:4}},{steps:[{kind:'frame',contacts:[0x40000000],hits:[0],cancelled:[]}]},{steps:[{kind:'frame',contacts:[1],hits:[],cancelled:[]}]},{steps:[{kind:'completion',record:'{"v":1,"id":1,"id":2,"ok":true}'},{kind:'frame',contacts:[],hits:[],cancelled:[]}]}];
 for(const patch of patches)expect(()=>decode({...tape(),...patch})).toThrow();
 expect(()=>decodeNativeTape(new Uint8Array(8*1024*1024+1))).toThrow('byte limit');
});
