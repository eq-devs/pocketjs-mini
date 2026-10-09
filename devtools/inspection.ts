import {strictJson} from '../container/strict-json.ts';
import {decodeInspectorTree,type InspectorTree} from './tree.ts';
export interface InspectionSnapshot {readonly revision:number;readonly platform:'ios'|'android';readonly frame:number;readonly tree:InspectorTree;}
export interface InspectionSelection {readonly revision:number;readonly frame:number;readonly nodeId:number;}
/** One admitted current-revision device snapshot, never an unbounded event history. */
export class DeviceInspection {
 private current:InspectionSnapshot|null=null;
 private selected:InspectionSelection|null=null;
 accept(bytes:Uint8Array,revision:number,platform:'ios'|'android'){
  if(!bytes.length||bytes.length>4*1024*1024+1024)throw Error('Inspection byte limit');
  const value=strictJson(bytes,{maxTokens:16384*64+256}) as any;
  if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).sort().join(',')!=='frame,platform,revision,tree'||value.revision!==revision||revision<1||value.platform!==platform||!Number.isSafeInteger(value.frame)||value.frame<1)throw Error('Inspection ownership rejected');
  if(this.current?.revision===revision&&value.frame<=this.current.frame)throw Error('Stale inspection frame');
  const tree=decodeInspectorTree(Buffer.from(JSON.stringify(value.tree)));
  this.current=Object.freeze({revision,platform,frame:value.frame,tree});
  // A selection owns one exact snapshot; IDs may be reused in later frames.
  this.selected=null;return this.current;
 }
 select(bytes:Uint8Array,revision:number){
  if(!bytes.length||bytes.length>128)throw Error('Inspection selection byte limit');
  const value=strictJson(bytes) as any,snapshot=this.current;
  if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).sort().join(',')!=='frame,nodeId,revision'||!snapshot||snapshot.revision!==revision||value.revision!==revision||value.frame!==snapshot.frame||!Number.isInteger(value.nodeId))throw Error('Stale or invalid inspection selection');
  if(value.nodeId===0){this.selected=null;return null;}
  if(!snapshot.tree.nodes.some(node=>node.id===value.nodeId))throw Error('Inspection node unavailable');
  this.selected=Object.freeze({revision,frame:snapshot.frame,nodeId:value.nodeId});return this.selected;
 }
 selection(){return this.selected;}
 snapshot(){return this.current;}
 clear(){this.current=null;this.selected=null;}
}
