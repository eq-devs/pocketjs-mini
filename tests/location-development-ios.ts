import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync,readFileSync} from 'node:fs';
import {resolve,join} from 'node:path';
const root=resolve(import.meta.dir,'..'),serial=Bun.argv[2];
assert.ok(serial&&/^[a-fA-F0-9-]{36}$/.test(serial),'Pass a booted simulator UUID');
const evidence=resolve(process.env.PJM_LOCATION_EVIDENCE??join(root,'build/ios-validation/location-development-'+Date.now()));mkdirSync(evidence,{recursive:true});
const modes=(process.env.PJM_LOCATION_CASES??'undeclared,deny,allow').split(',');assert.ok(modes.length&&new Set(modes).size===modes.length&&modes.every(mode=>['undeclared','deny','allow'].includes(mode)));
let log='';
try{
 for(const mode of modes){
  const child=Bun.spawn([process.execPath,join(root,'tests/navigation-native-ios.ts'),serial],{env:{...process.env,PJM_DEVELOPMENT_NETWORK:'1',PJM_DEVELOPMENT_LOCATION:mode,PJM_NAVIGATION_EVIDENCE:join(evidence,mode)},stdout:'pipe',stderr:'pipe'});const timer=setTimeout(()=>child.kill('SIGTERM'),900000);
  try{const [status,out,err]=await Promise.all([child.exited,new Response(child.stdout).text(),new Response(child.stderr).text()]);log+=mode+'\n'+out+err;assert.equal(status,0,err+'\n'+out);const summary=JSON.parse(readFileSync(join(evidence,mode,'summary.json'),'utf8'));assert.equal(summary.passedTests,1);assert.equal(summary.failedTests,0);assert.equal(summary.skippedTests,0);}finally{clearTimeout(timer);}
 }
 writeFileSync(join(evidence,'result.json'),JSON.stringify({platform:'ios',realSdkLocation:true,cases:modes,undeclaredDenied:modes.includes('undeclared'),nativeDenial:modes.includes('deny'),consentColdReopen:true,consentHotReload:true,approvedProvider:modes.includes('allow'),nativeOsApproval:modes.includes('allow'),simulatedGps:modes.includes('allow'),physicalDevice:false},null,2));console.log('UIKit development location cases passed with cold/hot persistence: '+modes.join(','));
}finally{writeFileSync(join(evidence,'commands.log'),log);}
