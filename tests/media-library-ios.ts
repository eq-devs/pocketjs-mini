import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {createHash} from 'node:crypto';
import {ownedMediaPng} from './media-library-fixture.ts';

// Own the entire device/library so the test never selects from an existing
// simulator's personal assets and failed attempts can be cleaned completely.
const root=resolve(import.meta.dir,'..');
const development=process.env.PJM_MEDIA_DEVELOPMENT==='1';
const signedCase=process.env.PJM_MEDIA_SIGNED_CASE??'library';assert.ok(['library','camera-deny','camera-cancel'].includes(signedCase));assert.ok(!development||signedCase==='library');
const developmentCase=process.env.PJM_MEDIA_DEVELOPMENT_CASE??'library';assert.ok(['library','cancel'].includes(developmentCase),'Invalid development media picker case');
const evidence=resolve(process.env.PJM_MEDIA_LIBRARY_EVIDENCE??join(root,'build/ios-validation/media-library-'+Date.now()));
mkdirSync(evidence,{recursive:true});
let serial:string|undefined,cleaned=false,log='';
const runtime=process.env.PJM_MEDIA_LIBRARY_RUNTIME??'com.apple.CoreSimulator.SimRuntime.iOS-26-4';
const type='com.apple.CoreSimulator.SimDeviceType.iPhone-17-Pro';
async function run(args:string[],timeout=120000,env=process.env){
 const child=Bun.spawn(args,{env,stdout:'pipe',stderr:'pipe'});const timer=setTimeout(()=>child.kill('SIGTERM'),timeout);
 try{const [status,out,err]=await Promise.all([child.exited,new Response(child.stdout).text(),new Response(child.stderr).text()]);log+=args.join(' ')+'\n'+out+err+'\n';assert.equal(status,0,args[0]+': '+err+'\n'+out);return out.trim();}finally{clearTimeout(timer);}
}
const png=ownedMediaPng();
const fixture=join(evidence,'owned-fixture.png');writeFileSync(fixture,png);
try{
 assert.equal(process.platform,'darwin','iOS simulator testing requires macOS');
 serial=await run(['xcrun','simctl','create','pjm-owned-media-library-'+Date.now(),type,runtime]);
 assert.match(serial,/^[A-F0-9]{8}(?:-[A-F0-9]{4}){3}-[A-F0-9]{12}$/i);
 await run(['xcrun','simctl','boot',serial]);await run(['xcrun','simctl','bootstatus',serial,'-b']);
 await run(['xcrun','simctl','addmedia',serial,fixture]);
 await run([process.execPath,join(root,development?'tests/navigation-native-ios.ts':'tests/navigation-signed-ios.ts'),serial],600000,{...process.env,PJM_MEDIA_UI_CASE:development?undefined:signedCase,PJM_DEVELOPMENT_MEDIA:development?developmentCase:undefined,PJM_DEVELOPMENT_NETWORK:development?'1':undefined,PJM_NAVIGATION_EVIDENCE:evidence});
 console.log(development&&developmentCase==='cancel'?'Owned-simulator development UIKit chooser cancellation checks passed.':'Owned-library '+(development?'development':'signed')+' UIKit picker and SDK resource checks passed.');
}finally{
 if(serial&&/^[A-F0-9-]{36}$/i.test(serial)){await run(['xcrun','simctl','shutdown',serial],30000).catch(()=>{});await run(['xcrun','simctl','delete',serial],30000);cleaned=true;}
 writeFileSync(join(evidence,'owned-simulator.json'),JSON.stringify({uuid:serial??null,createdForTest:true,runtime,fixture:'owned-fixture.png',width:64,height:32,fixtureSha256:createHash('sha256').update(png).digest('hex'),preexistingSimulatorUnmodified:true,cleaned},null,2));
 writeFileSync(join(evidence,'owned-device-and-test.log'),log);
}
