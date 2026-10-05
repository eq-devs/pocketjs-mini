import {verifyPocketHash} from '../bin/package-hash.ts';
export const POCKET_ADMISSION_VARIANTS=128,POCKET_ADMISSION_SECTIONS=262144;
/** Borrowed sections using the pinned native Package/select_guest format contract.
 * Authentication must precede this structural selection. No guest code executes. */
export function selectPocketInputs(bytes:Uint8Array,target:string,appId:string){
 if(bytes.length<24||bytes.length>64*1024*1024)throw Error('Pocket package byte limit');
 const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),end=bytes.length-8;
 const u32=(offset:number)=>view.getUint32(offset,true);
 const utf8=(value:Uint8Array)=>new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(value);
 if(u32(0)!==0x544b4350||u32(4)!==1)throw Error('Pocket package magic/version');
 verifyPocketHash(bytes);
 const manifestEnd=16+u32(8),count=u32(12),table=Math.ceil(manifestEnd/16)*16;
 if(manifestEnd>end||table>end||count>Math.floor((end-table)/40))throw Error('Pocket variant table bounds');
 if(count>POCKET_ADMISSION_VARIANTS)throw Error('Pocket variant work limit');
 let visited=0;
 let chosen:Map<number,Uint8Array>|undefined,abi=0;
 for(let index=0;index<count;index++){
  const entry=table+index*40,name=bytes.subarray(entry,entry+16),nul=name.indexOf(0);
  if(nul<=0)throw Error('Pocket target name');
  const nameText=utf8(name.subarray(0,nul)),sections=u32(entry+20),offset=u32(entry+24);
  if(offset>end||sections>Math.floor((end-offset)/16))throw Error('Pocket section table bounds');
  visited+=sections;if(visited>POCKET_ADMISSION_SECTIONS)throw Error('Pocket section work limit');
  const selected=nameText===target&&!chosen,values=selected?new Map<number,Uint8Array>():undefined;
  for(let section=0;section<sections;section++){
   const row=offset+section*16,kind=u32(row),start=u32(row+8),length=u32(row+12);
   if(start>end||length>end-start)throw Error('Pocket section bounds');
   if(values&&!values.has(kind))values.set(kind,bytes.subarray(start,start+length));
  }
  if(values){chosen=values;abi=u32(entry+16);}
 }
 if(!chosen||abi!==7)throw Error('Pocket target/ABI mismatch');
 const identity=chosen.get(1);if(!identity)throw Error('Pocket identity missing');
 const identityView=new DataView(identity.buffer,identity.byteOffset,identity.byteLength);let offset=0;const fields:string[]=[];
 for(let field=0;field<3;field++){
  if(offset+2>identity.length)throw Error('Pocket identity truncated');const length=identityView.getUint16(offset,true);offset+=2;
  if(length>identity.length-offset)throw Error('Pocket identity truncated');fields.push(utf8(identity.subarray(offset,offset+length)));offset+=length;
 }
 if(fields[1]!==appId)throw Error('Pocket application identity mismatch');
 const plan=chosen.get(2),js=chosen.get(3),pak=chosen.get(4)??new Uint8Array();
 if(!plan?.length||plan.length>1024*1024)throw Error('Pocket plan byte limit');
 if(!js?.length||js[js.length-1]!==0||js.length-1>16*1024*1024)throw Error('Pocket JavaScript termination/byte limit');
 utf8(js.subarray(0,js.length-1));
 return {plan,js:js.subarray(0,js.length-1),pak};
}
