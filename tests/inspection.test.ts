import {test,expect} from 'bun:test';
import {DeviceInspection} from '../devtools/inspection.ts';
import {decodeInspectorTree} from '../devtools/tree.ts';
const root={id:1,parent:0,type:1,text:'<literal> 😀',children:[],layout:[0,0,64,64]};
const bytes=(value:unknown)=>Buffer.from(JSON.stringify(value));
test('screen bounds preserve transformed geometry and reject invalid rectangles',()=>{
 const tree=(bounds:unknown)=>bytes({format:1,nodes:[{...root,bounds}]});
 const result=decodeInspectorTree(tree([20,30,40,50]));expect(result.nodes[0].bounds).toEqual([20,30,40,50]);expect(Object.isFrozen(result.nodes[0].bounds)).toBe(true);
 expect(decodeInspectorTree(tree(null)).nodes[0].bounds).toBeNull();
 for(const wrong of [[-1,0,2,2],[0,0,0,2],[0,0,2,-1],[1,2,3],['0',0,2,2],{},[0,0,Infinity,2]])expect(()=>decodeInspectorTree(tree(wrong))).toThrow();
});
test('device inspection keeps one immutable owned snapshot and rejects stale/malformed uploads',()=>{
 const store=new DeviceInspection(),record={revision:2,platform:'ios',frame:60,tree:{format:1,nodes:[root]}};
 expect(store.snapshot()).toBeNull();const first=store.accept(bytes(record),2,'ios');expect(first.tree.nodes[0].text).toBe(root.text);expect(Object.isFrozen(first)).toBe(true);
 for(const wrong of [{...record,revision:1},{...record,platform:'android'},{...record,frame:59},{...record,frame:60},{...record,frame:Infinity},{...record,extra:true},{...record,tree:{format:1,nodes:[]}}])expect(()=>store.accept(bytes(wrong),2,'ios')).toThrow();
 expect(store.snapshot()).toBe(first);expect(()=>store.accept(Buffer.alloc(4*1024*1024+1025),2,'ios')).toThrow();
 const next=store.accept(bytes({...record,frame:61}),2,'ios');expect(store.snapshot()).toBe(next);store.clear();expect(store.snapshot()).toBeNull();
});
test('selection owns an exact snapshot and clears when nodes can be reused',()=>{
 const store=new DeviceInspection(),record={revision:2,platform:'ios',frame:60,tree:{format:1,nodes:[root]}};
 const select=(value:unknown)=>store.select(bytes(value),2),valid={revision:2,frame:60,nodeId:1};
 expect(()=>select(valid)).toThrow();store.accept(bytes(record),2,'ios');
 const selected=select(valid);expect(selected).toEqual(valid);expect(Object.isFrozen(selected)).toBe(true);
 for(const wrong of [{...valid,revision:3},{...valid,frame:59},{...valid,nodeId:2},{...valid,nodeId:1.5},{...valid,extra:1}])expect(()=>select(wrong)).toThrow();
 expect(store.selection()).toBe(selected);expect(()=>store.select(Buffer.alloc(129),2)).toThrow();
 expect(()=>store.select(Buffer.from('{"revision":2,"frame":60,"nodeId":1,"nodeId":0}'),2)).toThrow();
 expect(select({...valid,nodeId:0})).toBeNull();select(valid);
 store.accept(bytes({...record,frame:61}),2,'ios');expect(store.selection()).toBeNull();expect(()=>select(valid)).toThrow();
 select({...valid,frame:61});store.clear();expect(store.selection()).toBeNull();
});
