import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {join,resolve} from 'node:path';
const root=resolve(import.meta.dir,'..'),evidence=resolve(process.env.PJM_GUEST_EXIT_EVIDENCE??join(root,'build/ios-validation/guest-exit-'+Date.now()));mkdirSync(evidence,{recursive:true});
const development=process.env.PJM_DEVELOPMENT_EXIT==='1';
let serial:string|undefined,passed=false,cleaned=false;const commands:unknown[]=[];
async function run(args:string[],timeout=120000){const child=Bun.spawn(args,{env:{...process.env,PJM_APP_EXIT_TEST:development?'':'1'},stdout:'pipe',stderr:'pipe'});const timer=setTimeout(()=>child.kill('SIGTERM'),timeout);try{const [exitCode,out,err]=await Promise.all([child.exited,new Response(child.stdout).text(),new Response(child.stderr).text()]);commands.push({args,exitCode,out,err});writeFileSync(join(evidence,'commands.json'),JSON.stringify(commands,null,2));assert.equal(exitCode,0,out+'\n'+err);return out.trim();}finally{clearTimeout(timer);}}
try{
 assert.equal(process.platform,'darwin');serial=await run(['xcrun','simctl','create','pjm-owned-guest-exit-'+Date.now(),'com.apple.CoreSimulator.SimDeviceType.iPhone-17-Pro','com.apple.CoreSimulator.SimRuntime.iOS-26-4']);assert.match(serial,/^[A-F0-9-]{36}$/i);await run(['xcrun','simctl','boot',serial]);await run(['xcrun','simctl','bootstatus',serial,'-b']);
 process.env.PJM_NAVIGATION_EVIDENCE=join(evidence,development?'development':'signed');await run([process.execPath,join(root,development?'tests/navigation-native-ios.ts':'tests/navigation-signed-ios.ts'),serial],900000);passed=true;
}finally{
 if(serial){await run(['xcrun','simctl','shutdown',serial]).catch(()=>{});await run(['xcrun','simctl','delete',serial]);cleaned=true;}
 writeFileSync(join(evidence,'result.json'),JSON.stringify({passed,development,simulator:serial??null,ownedSimulatorRemoved:cleaned,physicalDeviceUsed:false,bunVersion:Bun.version},null,2));
}
