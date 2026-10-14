import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {join,resolve} from 'node:path';
const root=resolve(import.meta.dir,'..'),evidence=resolve(process.env.PJM_PACKAGE_LOAD_EVIDENCE??join(root,'build/ios-validation/package-load-'+Date.now()));
mkdirSync(evidence,{recursive:true});
const runtime=process.env.PJM_PACKAGE_IOS_RUNTIME??'com.apple.CoreSimulator.SimRuntime.iOS-26-4';
let serial:string|undefined,cleaned=false,log='';
async function run(args:string[],timeout=120000,env=process.env){const child=Bun.spawn(args,{env,stdout:'pipe',stderr:'pipe'});const timer=setTimeout(()=>child.kill('SIGTERM'),timeout);try{const [status,out,err]=await Promise.all([child.exited,new Response(child.stdout).text(),new Response(child.stderr).text()]);log+=args.join(' ')+'\n'+out+err+'\n';assert.equal(status,0,args[0]+': '+err+'\n'+out);return out.trim();}finally{clearTimeout(timer);}}
try{
 assert.equal(process.platform,'darwin');
 await run(['rustup','run','stable','cargo','build','--release','--offline','--locked','--manifest-path',join(root,'core-ffi/Cargo.toml'),'--target','aarch64-apple-ios-sim'],300000,{...process.env,IPHONEOS_DEPLOYMENT_TARGET:'16.0'});
 serial=await run(['xcrun','simctl','create','pjm-owned-package-matrix-'+Date.now(),'com.apple.CoreSimulator.SimDeviceType.iPhone-17-Pro',runtime]);assert.match(serial,/^[A-F0-9]{8}(?:-[A-F0-9]{4}){3}-[A-F0-9]{12}$/i);
 await run(['xcrun','simctl','boot',serial]);await run(['xcrun','simctl','bootstatus',serial,'-b']);
 await run([process.execPath,join(root,process.env.PJM_PACKAGE_UI_UPDATE==='1'?'tests/package-update-ui-ios.ts':'tests/package-matrix-ios.ts'),serial],process.env.PJM_UPDATE_KEY_TRANSITION==='1'?1200000:600000,{...process.env,PJM_PACKAGE_LOAD_EVIDENCE:evidence});
 console.log(process.env.PJM_PACKAGE_UI_UPDATE==='1'?'Owned UIKit installed update UI checks passed.':'Owned UIKit simulator native package matrix and controlled downloads passed.');
}finally{
 if(serial && /^[A-F0-9-]{36}$/i.test(serial)){await run(['xcrun','simctl','shutdown',serial],30000).catch(()=>{});await run(['xcrun','simctl','delete',serial],30000);cleaned=true;}
 writeFileSync(join(evidence,'owned-simulator.json'),JSON.stringify({uuid:serial??null,createdForTest:true,runtime,preexistingSimulatorUnmodified:true,cleaned},null,2));writeFileSync(join(evidence,'owned-device-and-test.log'),log);
}
