import {test,expect} from 'bun:test';
import {resolve,join} from 'node:path';
import {readFileSync,readdirSync} from 'node:fs';
import {selectPocketInputs} from '../container/pocket-inputs.ts';
const upstream=resolve(process.env.PJM_TEST_UPSTREAM??join(import.meta.dir,'../examples/hello/.pjm/pocketjs'));
test('structural selection matches pinned format and rejects malformed packages',async()=>{
 const {encodePocketPackage,encodeIdentity}=await import(join(upstream,'contracts/spec/pocket-package.ts'));
 const make=(abi=7,js=new Uint8Array([49,0]),id='dev.pjm.test')=>encodePocketPackage({manifest:Buffer.from('{}'),variants:[{target:'pjm-ios',hostAbi:abi,sections:[{kind:1,bytes:encodeIdentity({output:'test',id,title:'Test'})},{kind:2,bytes:Buffer.from('{}')},{kind:3,bytes:js}]}]});
 const bytes=make(),selected=selectPocketInputs(bytes,'pjm-ios','dev.pjm.test');expect(Buffer.from(selected.plan).toString()).toBe('{}');expect([...selected.js]).toEqual([49]);expect(selected.pak.length).toBe(0);
 for(const payload of [make(8),make(7,new Uint8Array([49])),make(7,new Uint8Array([255,0])),make(7,undefined,'dev.other.app')])expect(()=>selectPocketInputs(payload,'pjm-ios','dev.pjm.test')).toThrow();
 expect(()=>selectPocketInputs(bytes,'pjm-android','dev.pjm.test')).toThrow();
 for(let length=0;length<bytes.length;length++)expect(()=>selectPocketInputs(bytes.subarray(0,length),'pjm-ios','dev.pjm.test')).toThrow();
 const corpus=join(upstream,'tests/fixtures/packages/corpus');
 for(const file of readdirSync(corpus).filter(name=>name.startsWith('bad-')&&name.endsWith('.pocket')))expect(()=>selectPocketInputs(readFileSync(join(corpus,file)),'pjm-ios','dev.pjm.test')).toThrow();
});
test('admission bounds repeated table work independently of package byte size',async()=>{
 const {fnv1a64}=await import(join(upstream,'contracts/spec/pocket-package.ts'));
 const sections=4096,table=32,offset=table+65*40,bytes=new Uint8Array(offset+sections*16+8),view=new DataView(bytes.buffer);
 view.setUint32(0,0x544b4350,true);view.setUint32(4,1,true);view.setUint32(8,2,true);bytes.set(Buffer.from('{}'),16);
 for(let index=0;index<65;index++){
  const entry=table+index*40;bytes.set(Buffer.from('pjm-ios'),entry);view.setUint32(entry+16,7,true);view.setUint32(entry+20,sections,true);view.setUint32(entry+24,offset,true);
 }
 const seal=(variants:number)=>{view.setUint32(12,variants,true);view.setBigUint64(bytes.length-8,fnv1a64(bytes.subarray(0,-8)),true);};
 seal(65);expect(bytes.length).toBeLessThan(70000);expect(()=>selectPocketInputs(bytes,'pjm-ios','dev.pjm.test')).toThrow('section work limit');
 seal(64);expect(()=>selectPocketInputs(bytes,'pjm-ios','dev.pjm.test')).toThrow('identity missing');
});
