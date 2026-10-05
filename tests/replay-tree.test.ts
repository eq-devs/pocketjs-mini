import {test,expect} from 'bun:test';
import {decodeInspectorTree} from '../devtools/tree.ts';
const bytes=(value:any)=>Buffer.from(JSON.stringify(value));
const root={id:1,parent:0,type:1,text:'',children:[2],layout:[0,0,64,64]},child={id:2,parent:1,type:2,text:'<guest> 😀',children:[],layout:[1,2,3,4]};
test('inspector tree retains original ids, geometry and literal guest text',()=>{const tree=decodeInspectorTree(bytes({format:1,nodes:[root,child]}));expect(tree.nodes[1].text).toBe('<guest> 😀');expect(tree.nodes[1].layout).toEqual([1,2,3,4]);expect(Object.isFrozen(tree.nodes[0].children)).toBe(true);});
test('inspector tree rejects cyclic, disconnected, stale or oversized records',()=>{
 for(const nodes of [[root],[root,child,child],[{...root,children:[2,2]},child],[root,{...child,parent:9}],[{...root,children:[2]}, {...child,children:[1]}],[{...root,children:[]},child],[root,{...child,text:'x'.repeat(4097)}],[root,{...child,layout:[1,2,3]}]])expect(()=>decodeInspectorTree(bytes({format:1,nodes}))).toThrow();
 expect(()=>decodeInspectorTree(Buffer.alloc(4*1024*1024+1))).toThrow('byte limit');
});
