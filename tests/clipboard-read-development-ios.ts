import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync,readFileSync} from 'node:fs';
import {resolve,join} from 'node:path';
const root=resolve(import.meta.dir,'..'),serial=Bun.argv[2];
assert.ok(serial&&/^[a-fA-F0-9-]{36}$/.test(serial),'Pass a booted simulator UUID');
const evidence=resolve(process.env.PJM_CLIPBOARD_READ_EVIDENCE??join(root,'build/ios-validation/clipboard-read-development-'+Date.now()));mkdirSync(evidence,{recursive:true});
let log='';
try{
 for(const mode of ['undeclared','deny','allow']){
  const child=Bun.spawn([process.execPath,join(root,'tests/navigation-native-ios.ts'),serial],{env:{...process.env,PJM_DEVELOPMENT_NETWORK:'1',PJM_DEVELOPMENT_CLIPBOARD_READ:mode,PJM_NAVIGATION_EVIDENCE:join(evidence,mode)},stdout:'pipe',stderr:'pipe'});const timer=setTimeout(()=>child.kill('SIGTERM'),900000);
  try{const [status,out,err]=await Promise.all([child.exited,new Response(child.stdout).text(),new Response(child.stderr).text()]);log+=mode+'\n'+out+err;assert.equal(status,0,err+'\n'+out);const summary=JSON.parse(readFileSync(join(evidence,mode,'summary.json'),'utf8'));assert.equal(summary.passedTests,1);assert.equal(summary.failedTests,0);assert.equal(summary.skippedTests,0);}finally{clearTimeout(timer);}
 }
 writeFileSync(join(evidence,'result.json'),JSON.stringify({platform:'ios',realSdkClipboardRead:true,undeclaredDenied:true,nativeDenial:true,nativeApproval:true,exactUnicodeReadback:true,consentColdReopen:true,consentHotReload:true,physicalDevice:false},null,2));console.log('UIKit development clipboard declaration, native deny/allow, exact SDK readback and consent persistence passed.');
}finally{writeFileSync(join(evidence,'commands.log'),log);}
