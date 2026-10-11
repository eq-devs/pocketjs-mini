import {test,expect} from 'bun:test';
import {generateKeyPairSync,createHash} from 'node:crypto';
import {mkdtempSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {canonical,signPackage} from '../container/package.ts';
import {PackageStore} from '../container/store.ts';
import {downloadUpdate} from '../container/distribution.ts';

test('actual TLS distribution preserves cold updates, rollback and host-owned publisher trust',async()=>{
 const temp=mkdtempSync('/private/tmp/pjm-distribution-');
 const upstream=resolve(import.meta.dir,'../examples/hello/.pjm/pocketjs');
 const {encodePocketPackage,encodeIdentity}=await import(join(upstream,'contracts/spec/pocket-package.ts'));
 const keys=generateKeyPairSync('ed25519'),replacement=generateKeyPairSync('ed25519'),appId='dev.test.distribution';
 const make=(version:string,key=keys.privateKey,embeddedId=appId,abi=7)=>{
  const body={app:{id:embeddedId,version},target:{id:'pjm-android',hostAbi:abi},viewport:{logical:[64,64],physical:[64,64],rasterDensity:1,presentation:'native',policy:'fixed'},features:{'input.touch':true},companions:[],modality:{form:'takeover',touch:'primary',pointer:'none',buttons:false,analog:0,screens:[{role:'primary',logical:[64,64],touch:true,resizable:false,orientation:'portrait'}]}};
  const plan=Buffer.from(JSON.stringify({...body,planHash:'sha256:'+createHash('sha256').update(canonical(body)).digest('hex')}));
  const payload=Buffer.from(encodePocketPackage({manifest:Buffer.from('{}'),variants:[{target:'pjm-android',hostAbi:abi,sections:[{kind:1,bytes:encodeIdentity({output:'test',id:embeddedId,title:'Test'})},{kind:2,bytes:plan},{kind:3,bytes:Buffer.from("/*"+"x".repeat(70000)+"*/1\0")}]}]}));
  return {payload,manifest:signPackage(payload,{appId,version,minHostAbi:7,entry:'main.pocket',pages:['/'],permissions:[],domains:[],targets:['pjm-android']},key)};
 };
 let server:ReturnType<typeof Bun.serve>|undefined;
 try{
  writeFileSync(join(temp,'tls.cnf'),'[req]\ndistinguished_name=dn\nprompt=no\nx509_extensions=v3\n[dn]\nCN=localhost\n[v3]\nsubjectAltName=DNS:localhost\nbasicConstraints=critical,CA:TRUE\n');
  const cert=join(temp,'cert.pem'),key=join(temp,'key.pem');
  const generated=Bun.spawnSync(['openssl','req','-x509','-newkey','rsa:2048','-nodes','-days','1','-keyout',key,'-out',cert,'-config',join(temp,'tls.cnf')],{stdout:'pipe',stderr:'pipe'});expect(generated.exitCode).toBe(0);
  let fixture=make('0.0.1'),mode='valid',requests=0;
  const releases:Array<()=>void>=[];let notifySlow:()=>void=()=>{};
  server=Bun.serve({hostname:'localhost',port:0,tls:{key:Bun.file(key),cert:Bun.file(cert)},fetch(request){
   requests++;const path=new URL(request.url).pathname;
   if(mode==='slow')return new Promise<Response>(resolve=>{releases.push(()=>resolve(Response.json(fixture.manifest)));notifySlow();});
   if(mode==='redirect')return new Response(null,{status:302,headers:{location:'/manifest.json'}});
   if(path==='/manifest.json'){
    if(mode==='large-manifest')return new Response(' '.repeat(65537));
    if(mode==='large-manifest-stream')return new Response(new ReadableStream({start(controller){for(let i=0;i<3;i++)controller.enqueue(new Uint8Array(32768).fill(32));controller.close();}}));
    if(mode==='duplicate')return new Response(JSON.stringify(fixture.manifest).replace('{','{"appId":"dev.other.app",'));
    return Response.json(fixture.manifest);
   }
   if(mode==='large-package')return new Response('small',{headers:{'content-length':String(64*1024*1024+1)}});
   if(mode==='tamper')return new Response('tampered package');
   
   return new Response(fixture.payload);
  }});
  const base='https://localhost:'+server.port,root=join(temp,'cache'),host={abi:7,target:'pjm-android' as const};
  const store=new PackageStore(root,keys.publicKey,host);
  const options=(version=fixture.manifest.version)=>({store,appId,version,manifestUrl:base+'/manifest.json',packageUrl:base+'/main.pocket'});
  // Trust only this temporary test certificate; never disable certificate validation.
  const transport=((url:any,init:any)=>fetch(url,{...init,tls:{ca:readFileSync(cert,'utf8')}})) as typeof fetch;
  await expect(downloadUpdate(options())).rejects.toThrow();
  await downloadUpdate(options(),transport);const running=store.coldStart(appId);expect(running.manifest.version).toBe('0.0.1');
  fixture=make('0.0.2');await downloadUpdate(options(),transport);expect(running.manifest.version).toBe('0.0.1');
  const reopened=new PackageStore(root,keys.publicKey,host);expect(reopened.coldStart(appId).manifest.version).toBe('0.0.2');
  reopened.rollback(appId);expect(reopened.coldStart(appId).manifest.version).toBe('0.0.1');
  const statePath=join(root,appId,'state.json'),before=readFileSync(statePath);
  for(const rejected of ['redirect','large-manifest','large-manifest-stream','duplicate','large-package','tamper']){
   mode=rejected;await expect(downloadUpdate(options(),transport)).rejects.toThrow();expect(readFileSync(statePath)).toEqual(before);
  }
  mode='valid';
  await expect(downloadUpdate(options('9.9.9'),transport)).rejects.toThrow('identity/version');expect(readFileSync(statePath)).toEqual(before);
  for(const invalid of [make('0.0.3',keys.privateKey,'dev.other.app'),make('0.0.3',keys.privateKey,appId,8)]){
   fixture=invalid;await expect(downloadUpdate(options(),transport)).rejects.toThrow();expect(readFileSync(statePath)).toEqual(before);
  }
  fixture={payload:Buffer.from('signed arbitrary bytes'),manifest:signPackage(Buffer.from('signed arbitrary bytes'),{...fixture.manifest,version:'0.0.3'},keys.privateKey)};
  await expect(downloadUpdate(options(),transport)).rejects.toThrow();expect(readFileSync(statePath)).toEqual(before);
  mode='slow';const controller=new AbortController();let wake:()=>void;const twoStarted=new Promise<void>(resolve=>{wake=resolve;});notifySlow=()=>{if(releases.length===2)wake();};
  const slowOptions={...options(),signal:controller.signal},secondStore=new PackageStore(join(temp,'second-cache'),keys.publicKey,host);
  const observe=(promise:Promise<unknown>)=>promise.then(()=>({ok:true}),error=>({ok:false,error}));
  const first=observe(downloadUpdate(slowOptions,transport)),second=observe(downloadUpdate({...slowOptions,store:secondStore},transport));await twoStarted;
  const slowCalls=requests;await expect(downloadUpdate({...options(),store:new PackageStore(root,keys.publicKey,host)},transport)).rejects.toThrow('BUSY');
  await expect(downloadUpdate({...options(),store:new PackageStore(join(temp,'third-cache'),keys.publicKey,host)},transport)).rejects.toThrow('BUSY');expect(requests).toBe(slowCalls);
  controller.abort(new Error('host cancelled'));const cancelled=await Promise.all([first,second]);for(const result of cancelled)expect(result.ok).toBe(false);for(const release of releases)release();mode='valid';expect(readFileSync(statePath)).toEqual(before);
  const calls=requests;await expect(downloadUpdate({...options(),manifestUrl:'http://localhost/manifest.json'},transport)).rejects.toThrow('HTTPS');
  const aborted=new AbortController();aborted.abort(new Error('host cancelled'));await expect(downloadUpdate({...options(),signal:aborted.signal},transport)).rejects.toThrow('host cancelled');expect(requests).toBe(calls);
  fixture=make('0.0.3',replacement.privateKey);await expect(downloadUpdate(options(),transport)).rejects.toThrow('signature');expect(readFileSync(statePath)).toEqual(before);
  // A trusted host release can replace its pinned key. The server cannot do so.
  const rotated=new PackageStore(root,replacement.publicKey,host);
  await downloadUpdate({...options(),store:rotated},transport);expect(rotated.coldStart(appId).manifest.version).toBe('0.0.3');
  const newState=readFileSync(statePath);expect(()=>rotated.rollback(appId)).toThrow('signature');expect(readFileSync(statePath)).toEqual(newState);
  expect(running.payload).toEqual(make('0.0.1').payload);
 }finally{server?.stop(true);rmSync(temp,{recursive:true,force:true});}
},30000);
