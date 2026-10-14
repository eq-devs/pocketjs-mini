import assert from 'node:assert/strict';
import {cpSync,mkdirSync,mkdtempSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {writeInstalledProject} from '../bin/installed-project.ts';

const root=resolve(import.meta.dir,'..'),serial=Bun.argv[2];
assert.ok(serial&&/^[a-fA-F0-9-]{36}$/.test(serial),'Pass a booted iOS simulator UUID');
const temp=mkdtempSync(join(tmpdir(),'pjm-resource-process-ios-')),native=join(temp,'host'),bundle='dev.pjm.resource.process.a'+Date.now();
const evidence=resolve(process.env.PJM_RESOURCE_PROCESS_EVIDENCE??join(root,'build/ios-validation/resource-process-'+Date.now()));mkdirSync(evidence,{recursive:true});
let launched=false,log='';
async function run(args:string[],env=process.env){const child=Bun.spawn(args,{env,stdout:'pipe',stderr:'pipe'});const timer=setTimeout(()=>child.kill('SIGTERM'),300000);try{const [status,out,err]=await Promise.all([child.exited,new Response(child.stdout).text(),new Response(child.stderr).text()]);log+=args.join(' ')+'\n'+out+err+'\n';if(args[0]==='xcodebuild')writeFileSync(join(evidence,'xcode.log'),out+'\n'+err);assert.equal(status,0,args[0]+': '+err+'\n'+out);return out;}finally{clearTimeout(timer);}}
try{
 await run([process.execPath,join(root,'tests/package-load-fixtures.ts'),join(temp,'cases.json')],{...process.env,PJM_PACKAGE_TARGET:'ios',PJM_PACKAGE_REAL:'',PJM_PACKAGE_HTTP_TEST:'',PJM_PACKAGE_LOCATION_SDK_TEST:''});
 const item=JSON.parse(readFileSync(join(temp,'cases.json'),'utf8'))[0];
 for(const [name,data] of [['main.pocket',Buffer.from(item.payload,'base64')],['manifest.json',JSON.stringify(item.manifest)],['publisher.key',Buffer.from(item.key,'base64')]] as const)writeFileSync(join(temp,name),data);
 writeInstalledProject({directory:native,bundle,library:join(root,'core-ffi/target/aarch64-apple-ios-sim/release/libmini_core_ffi.a'),payload:join(temp,'main.pocket'),envelope:join(temp,'manifest.json'),publicKey:join(temp,'publisher.key')});
 assert.equal(item.peers.length,3);writeFileSync(join(evidence,'peers.json'),JSON.stringify(item.peers,null,2)+'\n');writeFileSync(join(native,'ResourcePeers.h'),'static NSString * const ResourcePeersJSON = @'+JSON.stringify(JSON.stringify(item.peers))+';\n');
 cpSync(join(root,'tests/ResourceProcessApp.m'),join(native,'main.m'));cpSync(join(root,'tests/ResourceProcessTests.swift'),join(native,'Tests.swift'));launched=true;
 await run(['xcodebuild','-quiet','-project',join(native,'Mini.xcodeproj'),'-scheme','Mini','-configuration','Release','-destination','platform=iOS Simulator,id='+serial,'-derivedDataPath',join(native,'DerivedData'),'-parallel-testing-enabled','NO','-resultBundlePath',join(evidence,'Tests.xcresult'),'CODE_SIGNING_ALLOWED=NO','test']);
 await run(['xcrun','xcresulttool','export','attachments','--path',join(evidence,'Tests.xcresult'),'--output-path',join(evidence,'attachments')]);
 writeFileSync(join(evidence,'summary.json'),await run(['xcrun','xcresulttool','get','test-results','summary','--path',join(evidence,'Tests.xcresult')]));
 for(const name of ['main.pocket','manifest.json','publisher.key'])cpSync(join(temp,name),join(evidence,name));
 writeFileSync(join(evidence,'result.json'),JSON.stringify({productionRegistry:true,authenticatedControllers:6,roundsPerScenario:32,scenarios:2,authenticatedIdentities:4,processCap:16,perGenerationCap:4,nativeGenerationRetirements:256,delayedProducerTokenLifetime:true,foreignAndRetiredHandlesDenied:true,controlledProducerTokens:true,actualHttpMediaWorkers:false,physicalMemoryAcceptance:false},null,2));
 console.log('Native UIKit shared-resource process cap, generation retirement and delayed-token recovery passed.');
}finally{
 if(launched){await run(['xcrun','simctl','terminate',serial,bundle]).catch(()=>{});await run(['xcrun','simctl','uninstall',serial,bundle]).catch(()=>{});}
 writeFileSync(join(evidence,'commands.log'),log);rmSync(temp,{recursive:true,force:true});
}
