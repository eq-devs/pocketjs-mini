import {test,expect} from 'bun:test';
import {generateKeyPairSync,createHash} from 'node:crypto';
import {mkdtempSync,writeFileSync,rmSync,symlinkSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {signPackage,canonical} from '../container/package.ts';
import {preparePublication,uploadPublication} from '../bin/publish.ts';
test('publication verifies trusted signatures and uploads only matching signed bytes',async()=>{
 const upstream=resolve(process.env.PJM_TEST_UPSTREAM??join(import.meta.dir,'../examples/hello/.pjm/pocketjs'));
 const {encodePocketPackage,encodeIdentity}=await import(join(upstream,'contracts/spec/pocket-package.ts'));
 const plan={app:{id:'dev.test.publish',version:'1.0.0'},target:{id:'pjm-ios',hostAbi:7},viewport:{logical:[64,64],physical:[64,64],rasterDensity:1,presentation:'native',policy:'fixed'},features:{'input.touch':true},companions:[],modality:{form:'takeover',touch:'primary',pointer:'none',buttons:false,analog:0,screens:[{role:'primary',logical:[64,64],touch:true,resizable:false,orientation:'portrait'}]}};
 const planBytes=(body:any)=>Buffer.from(JSON.stringify({...body,planHash:'sha256:'+createHash('sha256').update(canonical(body)).digest('hex')}));
 const make=(id='dev.test.publish',abi=7,source=new Uint8Array([49,0]),body:any=plan)=>Buffer.from(encodePocketPackage({manifest:Buffer.from('{}'),variants:[{target:'pjm-ios',hostAbi:abi,sections:[{kind:1,bytes:encodeIdentity({output:'test',id,title:'Test'})},{kind:2,bytes:planBytes(body)},{kind:3,bytes:source}]}]}));
 const dir=mkdtempSync(join(tmpdir(),'pjm-publish-')),keys=generateKeyPairSync('ed25519'),payload=make();
 const metadata={appId:'dev.test.publish',version:'1.0.0',minHostAbi:7,entry:'main.pocket' as const,pages:['/'],permissions:[],domains:[],targets:['pjm-ios' as const]};
 const manifest=signPackage(payload,metadata,keys.privateKey),key=join(dir,'public.key');
 try{
  writeFileSync(join(dir,'main.pocket'),payload);writeFileSync(join(dir,'manifest.json'),JSON.stringify(manifest));writeFileSync(key,keys.publicKey.export({format:'der',type:'spki'}).subarray(-32));
  writeFileSync(join(dir,'manifest.json'),JSON.stringify(manifest).replace('{','{\"appId\":\"dev.other.app\",'));expect(()=>preparePublication(dir,key,'ios')).toThrow('strict JSON');writeFileSync(join(dir,'manifest.json'),JSON.stringify(manifest));
  const prepared=preparePublication(dir,key,'ios');expect(prepared.payload).toEqual(payload);expect(()=>preparePublication(dir,key,'android')).toThrow();
  for(const invalid of [Buffer.from('signed arbitrary bytes'),make('dev.other.app'),make(undefined,8),make(undefined,7,new Uint8Array([49]))]){
   writeFileSync(join(dir,'main.pocket'),invalid);writeFileSync(join(dir,'manifest.json'),JSON.stringify(signPackage(invalid,metadata,keys.privateKey)));expect(()=>preparePublication(dir,key,'ios')).toThrow();
  }
  for(const patch of [{app:{...plan.app,version:'2.0.0'}},{features:{'net.http':true}},{viewport:{...plan.viewport,physical:[65,64]}},{viewport:{...plan.viewport,logical:[2048,64]}},{modality:{...plan.modality,analog:true}}]){
   const invalid=make(undefined,undefined,undefined,{...plan,...patch});writeFileSync(join(dir,'main.pocket'),invalid);writeFileSync(join(dir,'manifest.json'),JSON.stringify(signPackage(invalid,metadata,keys.privateKey)));expect(()=>preparePublication(dir,key,'ios')).toThrow();
  }
  writeFileSync(join(dir,'main.pocket'),payload);writeFileSync(join(dir,'manifest.json'),JSON.stringify(manifest));
  let calls=0;const receipt={appId:manifest.appId,version:manifest.version,sha256:manifest.sha256,url:'https://distribution.example/apps/release'};
  const transport=(async(url:any,options:any)=>{calls++;expect(String(url)).toBe('https://distribution.example/upload');expect(options.redirect).toBe('error');expect(options.headers.Authorization).toBe('Bearer test-token');expect(options.headers['Idempotency-Key']).toContain(manifest.sha256);expect(Buffer.from(await options.body.get('package').arrayBuffer())).toEqual(payload);expect(JSON.parse(await options.body.get('manifest').text())).toEqual(manifest);expect(options.body.get('publicKey')).toBeNull();return Response.json(receipt,{status:201});}) as typeof fetch;
  expect(await uploadPublication(prepared,'https://distribution.example/upload','test-token',transport)).toEqual(receipt);expect(calls).toBe(1);
  for(const address of ['http://localhost/upload','https://user:pass@distribution.example/upload','https://distribution.example/upload?secret=x'])await expect(uploadPublication(prepared,address,'test-token',transport)).rejects.toThrow();
  await expect(uploadPublication(prepared,'https://distribution.example/upload','bad\ntoken',transport)).rejects.toThrow();expect(calls).toBe(1);
  await expect(uploadPublication({...prepared},'https://distribution.example/upload','test-token',transport)).rejects.toThrow('trusted package verification');expect(calls).toBe(1);
  prepared.payload.fill(0);prepared.manifest.appId='dev.changed.app';prepared.manifest.domains.push('attacker.example.com');
  expect(await uploadPublication(prepared,'https://distribution.example/upload','test-token',transport)).toEqual(receipt);expect(calls).toBe(2);
  for(const reply of [{...receipt,sha256:'0'.repeat(64)},{...receipt,url:'http://example.com/'},{...receipt,extra:true}])await expect(uploadPublication(prepared,'https://distribution.example/upload','test-token',(async()=>Response.json(reply)) as typeof fetch)).rejects.toThrow();
  const encoded=JSON.stringify(receipt);
  for(const malformed of [encoded.replace('{','{"appId":"dev.other.app",'),encoded.replace('{','{"\\u0061ppId":"dev.other.app",'),'\ufeff'+encoded,encoded.replace('release','\\ud800'),encoded+' trailing'])await expect(uploadPublication(prepared,'https://distribution.example/upload','test-token',(async()=>new Response(malformed)) as typeof fetch)).rejects.toThrow('strict JSON');
  await expect(uploadPublication(prepared,'https://distribution.example/upload','test-token',(async()=>new Response(new Uint8Array([0xff,0xfe]))) as typeof fetch)).rejects.toThrow();
  await expect(uploadPublication(prepared,'https://distribution.example/upload','test-token',(async()=>new Response('x'.repeat(16385))) as typeof fetch)).rejects.toThrow('16 KiB');
  await expect(uploadPublication(prepared,'https://distribution.example/upload','test-token',(async()=>new Response('secret server diagnostics',{status:409})) as typeof fetch)).rejects.toThrow('HTTP 409');
  const child=Bun.spawn([join(import.meta.dir,'../bin/pjm'),'publish','--package',dir,'--public-key',key,'--device','ios','--dry-run'],{stdout:'pipe',stderr:'pipe'});expect(await child.exited).toBe(0);expect(JSON.parse(await new Response(child.stdout).text()).verified).toBe(true);
  writeFileSync(join(dir,'main.pocket'),'tampered');expect(()=>preparePublication(dir,key,'ios')).toThrow('SHA-256');rmSync(join(dir,'main.pocket'));symlinkSync(key,join(dir,'main.pocket'));expect(()=>preparePublication(dir,key,'ios')).toThrow('regular file');
 }finally{rmSync(dir,{recursive:true,force:true});}
});
