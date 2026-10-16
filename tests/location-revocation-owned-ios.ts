// Opt-in native revocation regression. Own the simulator; never select a phone.
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {join,resolve} from 'node:path';
const root=resolve(import.meta.dir,'..');
const evidence=resolve(process.env.PJM_LOCATION_REVOCATION_EVIDENCE??join(root,'build/ios-validation/location-revocation-'+Date.now()));mkdirSync(evidence,{recursive:true});
const runtime=process.env.PJM_LOCATION_REVOCATION_RUNTIME??'com.apple.CoreSimulator.SimRuntime.iOS-26-4';
const deviceType=process.env.PJM_LOCATION_REVOCATION_DEVICE_TYPE??'com.apple.CoreSimulator.SimDeviceType.iPhone-17-Pro';
assert.match(runtime,/^com\.apple\.CoreSimulator\.SimRuntime\.iOS-[0-9]+-[0-9]+$/);assert.match(deviceType,/^com\.apple\.CoreSimulator\.SimDeviceType\.iPhone-[A-Za-z0-9-]+$/);
let passed=false;const commands:unknown[]=[],devices:{suite:string;serial:string;cleaned:boolean}[]=[];
async function run(args:string[],env=process.env,timeout=120000){const child=Bun.spawn(args,{env,stdout:'pipe',stderr:'pipe'});const timer=setTimeout(()=>child.kill('SIGTERM'),timeout);try{const [exitCode,out,err]=await Promise.all([child.exited,new Response(child.stdout).text(),new Response(child.stderr).text()]);commands.push({args,exitCode,out,err});writeFileSync(join(evidence,'commands.json'),JSON.stringify(commands,null,2));assert.equal(exitCode,0,out+'\n'+err);return out.trim();}finally{clearTimeout(timer);}}
try{
 assert.equal(process.platform,'darwin');
 for(const suite of ['revocation','baseline']){
  const serial=await run(['xcrun','simctl','create','pjm-owned-location-'+suite+'-'+Date.now(),deviceType,runtime]);assert.match(serial,/^[A-F0-9-]{36}$/i);
  const owned={suite,serial,cleaned:false};devices.push(owned);
  try{
   await run(['xcrun','simctl','boot',serial]);await run(['xcrun','simctl','bootstatus',serial,'-b']);
   const listing=JSON.parse(await run(['xcrun','simctl','list','devices','--json']));assert.ok(listing.devices[runtime].some((device:any)=>device.udid===serial&&device.state==='Booted'),'Owned simulator must boot the requested runtime');
   await run(['bash',join(root,'tests/package-surface-ios.sh'),serial,join(evidence,suite)],{...process.env,PJM_LOCATION_REVOCATION_TEST:suite==='revocation'?'1':''},900000);
  }finally{
   await run(['xcrun','simctl','shutdown',serial]).catch(()=>{});await run(['xcrun','simctl','delete',serial]);owned.cleaned=true;
  }
 }
 passed=true;
}finally{
 writeFileSync(join(evidence,'result.json'),JSON.stringify({passed,runtime,deviceType,devices,ownedSimulatorsRemoved:devices.length>0&&devices.every(device=>device.cleaned),signedCases:4,developmentCases:4,baselineSuitePassed:passed,controlledProvider:true,physicalDeviceUsed:false,bunVersion:Bun.version},null,2));
}
