import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import {join,resolve} from 'node:path';
const root=resolve(import.meta.dir,'..'),temp=mkdtempSync('/private/tmp/pjm-native-download-tls-');
const evidence=resolve(process.env.PJM_DOWNLOAD_TLS_EVIDENCE??join(root,'build/android-validation/package-download-tls-'+Date.now()));mkdirSync(evidence,{recursive:true});
let server:ReturnType<typeof Bun.serve>|undefined;const requests:Array<{path:string,time:number}>=[];let exitCode:number|undefined;
try{
 writeFileSync(join(temp,'tls.cnf'),'[req]\ndistinguished_name=dn\nprompt=no\nx509_extensions=v3\n[dn]\nCN=owned-download-test\n[v3]\nsubjectAltName=DNS:localhost,IP:127.0.0.1\nbasicConstraints=critical,CA:TRUE\n');
 const cert=join(temp,'cert.pem'),key=join(temp,'key.pem');
 const generated=Bun.spawnSync(['openssl','req','-x509','-newkey','rsa:2048','-nodes','-days','1','-keyout',key,'-out',cert,'-config',join(temp,'tls.cnf')],{stdout:'pipe',stderr:'pipe'});assert.equal(generated.exitCode,0,'Test certificate generation failed');
 writeFileSync(join(evidence,'server-cert.pem'),readFileSync(cert));
 server=Bun.serve({hostname:'127.0.0.1',port:0,tls:{key:Bun.file(key),cert:Bun.file(cert)},fetch(request){
  const path=new URL(request.url).pathname;requests.push({path,time:Date.now()});
  const item=JSON.parse(readFileSync(join(evidence,'cases.json'),'utf8'))[0],update=item.update,base='https://127.0.0.1:'+server!.port;
  if(path==='/redirect/latest.json')return new Response(null,{status:302,headers:{location:base+'/latest.json'}});
  if(path.endsWith('/latest.json'))return Response.json({appId:item.manifest.appId,version:update.manifest.version,manifestUrl:base+(path.startsWith('/duplicate/')?'/duplicate-manifest.json':path.startsWith('/oversize/')?'/oversized-manifest.json':'/manifest.json'),packageUrl:base+(path.startsWith('/tamper/')?'/tampered.pocket':'/main.pocket')});
  if(path==='/manifest.json')return Response.json(update.manifest);
  if(path==='/duplicate-manifest.json')return new Response(JSON.stringify(update.manifest).replace('{','{"appId":"dev.other.app",'));
  if(path==='/oversized-manifest.json')return new Response(new ReadableStream({start(controller){for(let i=0;i<3;i++)controller.enqueue(new Uint8Array(32768).fill(32));controller.close();}}));
  if(path==='/tampered.pocket')return new Response('tampered');
  if(path==='/main.pocket')return new Response(Buffer.from(update.payload,'base64'));
  return new Response(null,{status:404});
 }});
 const child=Bun.spawn([process.execPath,join(root,'tests/package-load-owned-android.ts')],{env:{...process.env,PJM_PACKAGE_LOAD_EVIDENCE:evidence,PJM_DOWNLOAD_TLS_URL:'https://127.0.0.1:'+server.port,PJM_DOWNLOAD_TLS_CERT:cert},stdout:Bun.file(join(evidence,'runner.log')),stderr:Bun.file(join(evidence,'runner-errors.log'))});
 const timer=setTimeout(()=>child.kill('SIGTERM'),1200000);try{exitCode=await child.exited;}finally{clearTimeout(timer);}assert.equal(exitCode,0,'Native TLS runner failed; inspect evidence');
 for(const path of ['/latest.json','/main.pocket','/tampered.pocket','/redirect/latest.json','/duplicate-manifest.json','/oversized-manifest.json'])assert.ok(requests.some(request=>request.path===path),'Missing real HTTPS request '+path);
 console.log('Actual Android HTTPS package discovery, trusted test CA, signed cache update and rollback passed.');
}finally{server?.stop(true);rmSync(temp,{recursive:true,force:true});writeFileSync(join(evidence,'tls-server-result.json'),JSON.stringify({exitCode:exitCode??null,loopbackOnly:true,actualRequests:requests,serverStopped:true,testKeysRemoved:true,productionTrustChanged:false},null,2));}
