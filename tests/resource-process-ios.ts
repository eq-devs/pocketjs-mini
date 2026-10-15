import assert from 'node:assert/strict';
import {cpSync,lstatSync,mkdirSync,mkdtempSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import {basename,join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {writeInstalledProject} from '../bin/installed-project.ts';

const root=resolve(import.meta.dir,'..'),serial=Bun.argv[2];
assert.ok(serial&&/^[a-fA-F0-9-]{36}$/.test(serial),'Pass a booted iOS simulator UUID');
const temp=mkdtempSync(join(tmpdir(),'pjm-resource-process-ios-')),native=join(temp,'host'),bundle='dev.pjm.resource.process.a'+Date.now();
const evidence=resolve(process.env.PJM_RESOURCE_PROCESS_EVIDENCE??join(root,'build/ios-validation/resource-process-'+Date.now()));mkdirSync(evidence,{recursive:true});
const httpProcess=process.env.PJM_HTTP_PROCESS==='1',mixedProcess=process.env.PJM_HTTP_MEDIA_PROCESS==='1';
assert.ok(!httpProcess||!mixedProcess,'Choose one HTTP process suite');
let nativeReceipt:any;
let launched=false,log='';
async function run(args:string[],env=process.env){const child=Bun.spawn(args,{env,stdout:'pipe',stderr:'pipe'});const timer=setTimeout(()=>child.kill('SIGTERM'),300000);try{const [status,out,err]=await Promise.all([child.exited,new Response(child.stdout).text(),new Response(child.stderr).text()]);log+=args.join(' ')+'\n'+out+err+'\n';if(args[0]==='xcodebuild')writeFileSync(join(evidence,'xcode.log'),out+'\n'+err);assert.equal(status,0,args[0]+': '+err+'\n'+out);return out;}finally{clearTimeout(timer);}}
try{
 await run([process.execPath,join(root,'tests/package-load-fixtures.ts'),join(temp,'cases.json')],{...process.env,PJM_PACKAGE_TARGET:'ios',PJM_PACKAGE_REAL:'',PJM_PACKAGE_HTTP_TEST:'',PJM_PACKAGE_LOCATION_SDK_TEST:''});
 const item=JSON.parse(readFileSync(join(temp,'cases.json'),'utf8'))[0];
 for(const [name,data] of [['main.pocket',Buffer.from(item.payload,'base64')],['manifest.json',JSON.stringify(item.manifest)],['publisher.key',Buffer.from(item.key,'base64')]] as const)writeFileSync(join(temp,name),data);
 writeInstalledProject({directory:native,bundle,library:join(root,'core-ffi/target/aarch64-apple-ios-sim/release/libmini_core_ffi.a'),payload:join(temp,'main.pocket'),envelope:join(temp,'manifest.json'),publicKey:join(temp,'publisher.key')});
 assert.equal(item.peers.length,3);writeFileSync(join(evidence,'peers.json'),JSON.stringify(item.peers,null,2)+'\n');writeFileSync(join(native,'ResourcePeers.h'),'static NSString * const ResourcePeersJSON = @'+JSON.stringify(JSON.stringify(item.peers))+';\n');
 cpSync(join(root,mixedProcess?'tests/MixedProcessApp.m':httpProcess?'tests/HttpProcessApp.m':'tests/ResourceProcessApp.m'),join(native,'main.m'));cpSync(join(root,mixedProcess?'tests/MixedProcessTests.swift':httpProcess?'tests/HttpProcessTests.swift':'tests/ResourceProcessTests.swift'),join(native,'Tests.swift'));launched=true;
 let testFailure:unknown;
 try{await run(['xcodebuild','-quiet','-project',join(native,'Mini.xcodeproj'),'-scheme','Mini','-configuration','Release','-destination','platform=iOS Simulator,id='+serial,'-derivedDataPath',join(native,'DerivedData'),'-parallel-testing-enabled','NO','-resultBundlePath',join(evidence,'Tests.xcresult'),'CODE_SIGNING_ALLOWED=NO','test']);}catch(error){testFailure=error;}
 if(mixedProcess)try{
  const container=(await run(['xcrun','simctl','get_app_container',serial,bundle,'data'])).trim();assert.ok(container.startsWith('/'),'Expected an absolute owned-app container');
  const source=join(container,'Library/Caches/mixed-process-trace.json'),stat=lstatSync(source);assert.ok(stat.isFile()&&!stat.isSymbolicLink()&&stat.size<=65536,'Invalid bounded mixed trace');
  const trace=JSON.parse(readFileSync(source,'utf8'));assert.ok(Array.isArray(trace.events)&&trace.events.length>0&&trace.events.length<=128);if(!testFailure)assert.ok(trace.outcome.startsWith('native-mixed-process PASS '));
  writeFileSync(join(evidence,'phase-trace.json'),JSON.stringify(trace,null,2)+'\n');
 }catch(error){log+='Mixed trace capture failed: '+String(error)+'\n';if(!testFailure)throw error;}
 try{
  await run(['xcrun','xcresulttool','export','attachments','--path',join(evidence,'Tests.xcresult'),'--output-path',join(evidence,'attachments')]);
  writeFileSync(join(evidence,'summary.json'),await run(['xcrun','xcresulttool','get','test-results','summary','--path',join(evidence,'Tests.xcresult')]));
 }catch(error){if(testFailure)throw testFailure;throw error;}
 if(testFailure)throw testFailure;

 if(httpProcess||mixedProcess){
  const manifest=JSON.parse(readFileSync(join(evidence,'attachments/manifest.json'),'utf8'));
  const receipts=manifest.flatMap((test:any)=>test.attachments??[]).filter((item:any)=>item.suggestedHumanReadableName?.startsWith(mixedProcess?'mixed-process-result_':'http-process-result_'));
  assert.equal(receipts.length,1,'Expected one authoritative HTTP receipt');
  const name=receipts[0].exportedFileName;assert.equal(basename(name),name);assert.match(name,/^[A-Za-z0-9-]+\.json$/);
  const receipt=JSON.parse(readFileSync(join(evidence,'attachments',name),'utf8'));
  for(const [key,value] of Object.entries(mixedProcess?{authenticatedIdentities:4,mixedStages:3,mixedSuccessfulHttpsResponses:30,mixedJpegResponses:2,verifiedGuestReplies:32,mixedResourceCapacityDenials:6,nativeGenerationRetirements:4,staleContainerPostDenials:16,mixedInFlightHttpRetirements:15,mixedInFlightMediaRetirements:1,peakRunningURLSessionTasks:15,peakImageProviderWorkers:1,mediaBusyDenials:1,cancelledMediaRetainedCapacityDenials:1,processCap:16,syntheticMediaProvider:true,controlledTiming:true,controlledTransport:false,defaultTlsTrust:true,foreignReadAndReleaseDenied:true}:{authenticatedIdentities:4,waves:2,actualHttpsResponses:32,peakRunningURLSessionTasks:16,globalResourceDenials:4,nativeGenerationRetirements:8,inFlightHttpsRetirements:16,cancellationHttpsHeaders:16,verifiedGuestReplies:32,staleContainerPostDenials:32,controlledTiming:true,releasedResources:16,processCap:16,defaultTlsTrust:true,controlledTransport:false,foreignReadAndReleaseDenied:true}))assert.equal(receipt[key],value,key);
  if(httpProcess)assert.ok(Number.isSafeInteger(receipt.responseBytesRead)&&receipt.responseBytesRead>0);
  nativeReceipt=receipt;
  writeFileSync(join(evidence,mixedProcess?'native-mixed-receipt.json':'native-http-receipt.json'),JSON.stringify(receipt,null,2)+'\n');
 }

 for(const name of ['main.pocket','manifest.json','publisher.key'])cpSync(join(temp,name),join(evidence,name));
 writeFileSync(join(evidence,'result.json'),JSON.stringify(mixedProcess?{...nativeReceipt,productionRegistry:true,actualHttpMediaWorkers:true,syntheticPickerApproval:true,offscreenForegroundOverride:true,pickerUiAcceptance:false,physicalMemoryAcceptance:false}:httpProcess?{productionRegistry:true,authenticatedControllers:5,authenticatedIdentities:4,waves:2,actualHttpsResponses:32,peakRunningURLSessionTasks:16,processCap:16,perGenerationCap:4,nativeGenerationRetirements:8,inFlightHttpsRetirements:16,cancellationHttpsHeaders:16,verifiedGuestReplies:32,staleContainerPostDenials:32,controlledTiming:true,foreignAndRetiredHandlesDenied:true,controlledTransport:false,actualHttpWorkers:true,actualHttpMediaWorkers:false,physicalMemoryAcceptance:false}:{productionRegistry:true,authenticatedControllers:6,roundsPerScenario:32,scenarios:2,authenticatedIdentities:4,processCap:16,perGenerationCap:4,nativeGenerationRetirements:256,delayedProducerTokenLifetime:true,foreignAndRetiredHandlesDenied:true,controlledProducerTokens:true,actualHttpMediaWorkers:false,physicalMemoryAcceptance:false},null,2));
 console.log(mixedProcess?'Native UIKit mixed HTTP/image process checks passed.':httpProcess?'Native UIKit real HTTPS process cap, generation retirement and foreign-handle denial passed.':'Native UIKit shared-resource process cap, generation retirement and delayed-token recovery passed.');
}finally{
 if(launched){await run(['xcrun','simctl','terminate',serial,bundle]).catch(()=>{});await run(['xcrun','simctl','uninstall',serial,bundle]).catch(()=>{});}
 writeFileSync(join(evidence,'commands.log'),log);rmSync(temp,{recursive:true,force:true});
}
