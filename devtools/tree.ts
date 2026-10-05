import {strictJson} from '../container/strict-json.ts';
export interface InspectorNode {readonly id:number;readonly parent:number;readonly type:number;readonly text:string;readonly children:readonly number[];readonly layout:readonly number[]|null;}
export interface InspectorTree {readonly format:1;readonly nodes:readonly InspectorNode[];}
export function decodeInspectorTree(bytes:Uint8Array):InspectorTree{
 if(!bytes.length||bytes.length>4*1024*1024)throw Error('Inspector byte limit');
 const tree=strictJson(bytes,{maxTokens:16384*64+128}) as any,fail=()=>{throw Error('Invalid inspector tree');};
 const exact=(object:any,keys:string)=>object&&typeof object==='object'&&!Array.isArray(object)&&Object.keys(object).sort().join(',')===keys;
 const id=(value:any)=>Number.isInteger(value)&&value!==0&&value>=-2147483648&&value<=2147483647;
 if(!exact(tree,'format,nodes')||tree.format!==1||!Array.isArray(tree.nodes)||!tree.nodes.length||tree.nodes.length>16384)fail();
 const map=new Map<number,any>();let textBytes=0;
 for(const node of tree.nodes){
  if(!exact(node,'children,id,layout,parent,text,type')||!id(node.id)||!(node.parent===0||id(node.parent))||!Number.isInteger(node.type)||node.type<0||node.type>255||typeof node.text!=='string'||!Array.isArray(node.children)||node.children.length>16384||!node.children.every(id)||new Set(node.children).size!==node.children.length||map.has(node.id))fail();
  const length=new TextEncoder().encode(node.text).length;textBytes+=length;if(length>4096||textBytes>2*1024*1024)fail();
  if(node.layout!==null&&(!Array.isArray(node.layout)||node.layout.length!==4||!node.layout.every((value:any)=>typeof value==='number'&&Number.isFinite(value))))fail();map.set(node.id,node);
 }
 if(!map.has(1)||map.get(1).parent!==0)fail();
 for(const node of tree.nodes)for(const child of node.children)if(!map.has(child)||map.get(child).parent!==node.id)fail();
 const stack=[1],seen=new Set<number>();while(stack.length){const current=stack.pop()!;if(seen.has(current))fail();seen.add(current);const children=map.get(current).children;if(stack.length+children.length>16384)fail();stack.push(...children);}
 if(seen.size!==map.size)fail();
 for(const node of tree.nodes){Object.freeze(node.children);if(node.layout)Object.freeze(node.layout);Object.freeze(node);}Object.freeze(tree.nodes);return Object.freeze(tree);
}
