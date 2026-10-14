import assert from 'node:assert/strict';
import {cpSync,existsSync,mkdirSync,mkdtempSync,readFileSync,writeFileSync,rmSync,symlinkSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {createHash,generateKeyPairSync,randomBytes} from 'node:crypto';
import {compileApplication} from '../bin/compiler.ts';
import {writeInstalledProject} from '../bin/installed-project.ts';
import {signPackage} from '../container/package.ts';
import {nativeReplayEngine} from '../devtools/native-engine.ts';
import {decodeInspectorTree} from '../devtools/tree.ts';
const root=resolve(import.meta.dir,'..'),serial=Bun.argv[2];assert.match(serial??'',/^[A-F0-9-]{36}$/i);
const evidence=resolve(process.env.PJM_PACKAGE_LOAD_EVIDENCE??join(root,'build/ios-validation/package-update-ui-'+Date.now()));mkdirSync(evidence,{recursive:true});
const temp=mkdtempSync('/private/tmp/pjm-package-update-ui-'),bundle='dev.pjm.update.ui.a'+Date.now();
const keyTransition=process.env.PJM_UPDATE_KEY_TRANSITION==='1';let servePrevious=false;
let installed=false,server:ReturnType<typeof Bun.serve>|undefined;let log='';const requests:string[]=[];
async function run(args:string[]){const child=Bun.spawn(args,{stdout:'pipe',stderr:'pipe'});const timer=setTimeout(()=>child.kill('SIGTERM'),300000);try{const [status,out,err]=await Promise.all([child.exited,new Response(child.stdout).text(),new Response(child.stderr).text()]);log+=args.join(' ')+'\n'+out+err+'\n';if(args[0]==='xcodebuild')writeFileSync(join(evidence,'xcode.log'),out+err);assert.equal(status,0,err+'\n'+out);return out;}finally{clearTimeout(timer);}}
try{
 const keys=generateKeyPairSync('ed25519'),nextKeys=keyTransition?generateKeyPairSync('ed25519'):keys;const releases=[];
 for(const [version,color] of [['1.0.0','red'],['2.0.0','green']]){
  const project=join(temp,version);mkdirSync(join(project,'app'),{recursive:true});mkdirSync(join(project,'.pjm'));symlinkSync(join(root,'examples/hello/.pjm/pocketjs'),join(project,'.pjm/pocketjs'));
  writeFileSync(join(project,'tsconfig.json'),readFileSync(join(root,'examples/navigation/tsconfig.json')));writeFileSync(join(project,'mini.json'),JSON.stringify({name:'update-proof',version,pages:['/']}));
  writeFileSync(join(project,'app/main.tsx'),`import {createSignal,createEffect} from 'solid-js';import {mount} from '@pocketjs/framework/solid';import {View,Text} from '@pocketjs/framework/components';import {connectMiniApp} from '@pocketjs/mini';const [count,setCount]=createSignal(0);function App(){return <View class="w-full h-full bg-${color}-600 flex-col justify-center items-center gap-4 p-6"><Text class="text-white text-xl">Release ${version}</Text><Text class="text-white text-xl">Counter: {count()}</Text><View focusable onPress={()=>setCount(count()+1)} class="bg-slate-700 p-4 rounded-xl"><Text class="text-white text-base">Increment update counter</Text></View></View>;}mount(App);const mini=connectMiniApp();createEffect(()=>{mini.storage.set('update-proof',{version:'${version}',count:count()}).promise.catch(error=>{throw Error('Update proof '+error.code);});});`);
  const compiled=await compileApplication({project,upstream:join(project,'.pjm/pocketjs'),directory:join(project,'build'),platform:'ios',window:{width:402,height:778,density:3,top:0,bottom:0,left:0,right:0}});
  releases.push({payload:compiled.packed,envelope:signPackage(compiled.packed,compiled.metadata,version==='1.0.0'?keys.privateKey:nextKeys.privateKey),metadata:compiled.metadata});
 }
 const [old,next]=releases;assert.equal(old.metadata.appId,next.metadata.appId);assert.equal(next.metadata.version,'2.0.0');
 const engine=nativeReplayEngine(join(root,'core-ffi/target/release/libmini_core_ffi.dylib'),{appId:old.metadata.appId,version:old.metadata.version},true);let point:number[];
 try{engine.boot(old.payload,{format:1,packageSha256:createHash('sha256').update(old.payload).digest('hex'),target:'pjm-ios',launchData:'{}',window:{width:402,height:778,density:3},steps:[]});engine.frame([],[],[]);const nodes=decodeInspectorTree(engine.inspectTree!()).nodes,marker=nodes.find(node=>node.text==='Increment update counter');assert.ok(marker);const bounds=nodes.find(node=>node.id===marker.parent)?.bounds;assert.ok(bounds);point=[bounds[0]+bounds[2]/2,bounds[1]+bounds[3]/2];}finally{engine.close();}
 writeFileSync(join(temp,'main.pocket'),old.payload);writeFileSync(join(temp,'manifest.json'),JSON.stringify(old.envelope));writeFileSync(join(temp,'publisher.key'),keys.publicKey.export({format:'der',type:'spki'}).subarray(-32));
 writeFileSync(join(temp,'next-publisher.key'),nextKeys.publicKey.export({format:'der',type:'spki'}).subarray(-32));cpSync(join(temp,'next-publisher.key'),join(evidence,'next-publisher.key'));
 writeFileSync(join(temp,'tls.cnf'),'[req]\ndistinguished_name=dn\nprompt=no\nx509_extensions=v3\n[dn]\nCN=owned-update-test\n[v3]\nsubjectAltName=IP:127.0.0.1\nbasicConstraints=critical,CA:FALSE\nkeyUsage=critical,digitalSignature,keyEncipherment\nextendedKeyUsage=serverAuth\n');
 const cert=join(temp,'cert.pem'),key=join(temp,'key.pem');await run(['openssl','req','-x509','-newkey','rsa:2048','-nodes','-days','1','-keyout',key,'-out',cert,'-config',join(temp,'tls.cnf')]);await run(['openssl','x509','-in',cert,'-outform','DER','-out',join(temp,'tls-cert.der')]);cpSync(cert,join(evidence,'server-cert.pem'));
 server=Bun.serve({hostname:'127.0.0.1',port:0,tls:{key:Bun.file(key),cert:Bun.file(cert)},fetch(request){const path=new URL(request.url).pathname;requests.push(path);const release=servePrevious?old:next;const base='https://127.0.0.1:'+server!.port;if(path==='/latest.json')return Response.json({appId:release.metadata.appId,version:release.metadata.version,manifestUrl:base+'/manifest.json',packageUrl:base+'/main.pocket'});if(path==='/manifest.json')return Response.json(release.envelope);if(path==='/main.pocket')return new Response(release.payload);return new Response(null,{status:404});}});
 async function phase(name:string,current:boolean,previous:boolean,download:boolean){
 const native=join(temp,name),phaseEvidence=join(evidence,name);mkdirSync(phaseEvidence);
 writeInstalledProject({directory:native,bundle,library:join(root,'core-ffi/target/aarch64-apple-ios-sim/release/libmini_core_ffi.a'),payload:join(temp,'main.pocket'),envelope:join(temp,'manifest.json'),publicKey:join(temp,current?'next-publisher.key':'publisher.key'),previousPublicKey:previous?join(temp,'publisher.key'):undefined,distributionUrl:download?'https://127.0.0.1:'+server!.port+'/latest.json':undefined});
 cpSync(join(temp,'tls-cert.der'),join(native,'tls-cert.der'));cpSync(join(root,'tests/UpdateProofObserver.h'),join(native,'UpdateProofObserver.h'));
 let trust=readFileSync(join(root,'tests/package-download-tls-ios.m'),'utf8').split('static void tlsDownloadWait')[0];trust=trust.replace('@implementation TLSPackageDownload','@implementation TLSPackageDownload\n- (instancetype)initWithStore:(MiniPackageStore *)store {if((self=[super initWithStore:store])){self.testCertificate=[NSData dataWithContentsOfFile:[NSBundle.mainBundle pathForResource:@"tls-cert" ofType:@"der"]];NSAssert(self.testCertificate.length,@"Missing test certificate");}return self;}');writeFileSync(join(native,'UpdateTrustDownload.h'),trust);
 const controllerPath=join(native,'InstalledController.m'),controller=readFileSync(controllerPath,'utf8'),factory='[[MiniPackageDownload alloc] initWithStore:_store]';assert.equal(controller.split(factory).length,2);writeFileSync(controllerPath,'#import "UpdateTrustDownload.h"\n'+controller.replace(factory,'[[TLSPackageDownload alloc] initWithStore:_store]').replace('if(failure)NSLog(@"Package update rejected:', '[self setValue:(failure?@"rejected":@"staged") forKey:@"updateDownloadResult"];if(failure)NSLog(@"Package update rejected:'));
 const mainPath=join(native,'main.m'),main=readFileSync(mainPath,'utf8'),allocation='[[MiniInstalledController alloc] initWithIdentity:';assert.equal(main.split(allocation).length,2);writeFileSync(mainPath,'#import "UpdateProofObserver.h"\n'+main.replace(allocation,'[[UpdateProofController alloc] initWithIdentity:'));
 const projectPath=join(native,'Mini.xcodeproj/project.pbxproj');let project=readFileSync(projectPath,'utf8');project=project.replace('objects = {','objects = {\n PJMCERT = {isa = PBXFileReference; lastKnownFileType = file; path = "tls-cert.der"; sourceTree = "<group>"; }; PJMCERTBUILD = {isa = PBXBuildFile; fileRef = PJMCERT; };').replace(/(A034 = .*?files = \()([^)]*)(\);)/, '$1$2, PJMCERTBUILD$3').replace('"-framework", UIKit','"-framework", Security, "-framework", UIKit');writeFileSync(projectPath,project);
 cpSync(join(root,'tests/UpdateInstalledTests.swift'),join(native,'Tests.swift'));writeFileSync(join(native,'TestConfig.swift'),'let pjmUpdateTap: [Double] = '+JSON.stringify(point!)+'\nlet pjmUpdatePhase = '+JSON.stringify(name)+'\n');
 cpSync(join(temp,current?'next-publisher.key':'publisher.key'),join(phaseEvidence,'publisher.key'));cpSync(join(native,'UpdateTrustDownload.h'),join(phaseEvidence,'test-trust-source.h'));cpSync(join(native,'UpdateProofObserver.h'),join(phaseEvidence,'test-observer-source.h'));
 for(const [name,value] of [['baseline.pocket',old.payload],['baseline-manifest.json',JSON.stringify(old.envelope)],['update.pocket',next.payload],['update-manifest.json',JSON.stringify(next.envelope)],['controller-test-source.m',readFileSync(controllerPath)],['main-test-source.m',readFileSync(mainPath)]] as const)writeFileSync(join(phaseEvidence,name),value);
 const buildArgs=['xcodebuild','-quiet','-project',join(native,'Mini.xcodeproj'),'-scheme','Mini','-configuration','Release','-destination','platform=iOS Simulator,id='+serial,'-derivedDataPath',join(native,'DerivedData'),'-parallel-testing-enabled','NO','CODE_SIGNING_ALLOWED=NO'];
 await run([...buildArgs,'build-for-testing']);cpSync(join(evidence,'xcode.log'),join(phaseEvidence,'build.log'));
 const app=join(native,'DerivedData/Build/Products/Release-iphonesimulator/Mini.app');
 for(const filename of ['publisher.key',...(previous?['publisher.previous.key']:[])])assert.deepEqual(readFileSync(join(app,filename)),readFileSync(join(native,filename)));
 assert.equal(existsSync(join(app,'publisher.previous.key')),previous);
 await run(['xcrun','simctl','install',serial,app]);installed=true;
 const installedApp=(await run(['xcrun','simctl','get_app_container',serial,bundle,'app'])).trim();
 for(const filename of ['publisher.key',...(previous?['publisher.previous.key']:[])])assert.deepEqual(readFileSync(join(installedApp,filename)),readFileSync(join(app,filename)));
 assert.deepEqual(readFileSync(join(installedApp,'publisher.trust')),Buffer.from([1,previous?2:1]),'Installed host must select the requested trust set');
 writeFileSync(join(phaseEvidence,'installed-trust.json'),JSON.stringify({primaryMatchesExport:true,previousKeyEnabled:previous,previousKeyFilePresent:existsSync(join(installedApp,'publisher.previous.key'))},null,2));
 try{await run([...buildArgs,'-resultBundlePath',join(phaseEvidence,'Tests.xcresult'),'test-without-building']);}finally{cpSync(join(evidence,'xcode.log'),join(phaseEvidence,'xcode.log'));}
 await run(['xcrun','xcresulttool','export','attachments','--path',join(phaseEvidence,'Tests.xcresult'),'--output-path',join(phaseEvidence,'attachments')]);writeFileSync(join(phaseEvidence,'summary.json'),await run(['xcrun','xcresulttool','get','test-results','summary','--path',join(phaseEvidence,'Tests.xcresult')]));

 const data=(await run(['xcrun','simctl','get_app_container',serial,bundle,'data'])).trim();
 const state=readFileSync(join(data,'Library/mini-packages',old.metadata.appId,'state.json'));writeFileSync(join(phaseEvidence,'state.json'),state);
 writeFileSync(join(phaseEvidence,'data-container.txt'),data+'\n');

 for(const filename of ['publisher.key',...(previous?['publisher.previous.key']:[])]){assert.deepEqual(readFileSync(join(app,filename)),readFileSync(join(native,filename)));cpSync(join(app,filename),join(phaseEvidence,filename));}
 assert.equal(existsSync(join(app,'publisher.previous.key')),previous);
 return data;
 }
 cpSync(join(temp,'publisher.key'),join(evidence,'publisher.key'));
 for(const [name,value] of [['baseline.pocket',old.payload],['baseline-manifest.json',JSON.stringify(old.envelope)],['update.pocket',next.payload],['update-manifest.json',JSON.stringify(next.envelope)]] as const)writeFileSync(join(evidence,name),value);
 if(keyTransition){
  const data=await phase('baseline',false,false,false),sentinel=randomBytes(32),marker='pjm-key-handoff-marker';writeFileSync(join(data,'Library',marker),sentinel);
  writeFileSync(join(temp,'main.pocket'),next.payload);writeFileSync(join(temp,'manifest.json'),JSON.stringify(next.envelope));
  const overlapData=await phase('overlap',true,true,true);assert.deepEqual(readFileSync(join(overlapData,'Library',marker)),sentinel,'Host upgrade must preserve private data');
  servePrevious=true;const revokedData=await phase('revoked',true,false,true);assert.deepEqual(readFileSync(join(revokedData,'Library',marker)),sentinel,'Revocation host upgrade must preserve private data');
  writeFileSync(join(evidence,'private-marker-sha256.txt'),createHash('sha256').update(sentinel).digest('hex')+'\n');
 }else await phase('standard',false,false,true);
 assert.equal(requests.filter(path=>path==='/main.pocket').length,keyTransition?6:3,'Each launch must discover and stage via HTTPS');
 if(keyTransition)writeFileSync(join(evidence,'key-transition-result.json'),JSON.stringify({distinctPublisherKeys:true,hostUpgradePreservedCacheAndSentinel:true,overlapHttpsStagingAndColdPixels:true,overlapRollbackPixels:true,revokedOldKeyDownloadRejectedWithoutStateMutation:true,revokedOldKeyRollbackRejectedWithoutStateMutation:true,newKeyColdPixelsAfterRevocation:true,physicalAcceptance:false},null,2));
 writeFileSync(join(evidence,'result.json'),JSON.stringify({exitCode:0,realTsx:true,productionInstalledController:true,testOnlyTLSAnchor:true,testOnlyReadOnlyObserverAndRollbackButton:true,actualHttpsDownloads:requests.filter(path=>path==='/main.pocket').length,publisherKeyTransition:keyTransition,runningOldScreenAndCounterRetained:true,backgroundResume:true,coldUpdatedScreenAndPixels:true,coldRollbackScreenAndPixels:true,physicalAcceptance:false},null,2));console.log('Installed UIKit signed TSX HTTPS update, retained counter, cold new pixels and rollback pixels passed.');
}finally{
 if(installed){await run(['xcrun','simctl','terminate',serial,bundle]).catch(()=>{});await run(['xcrun','simctl','uninstall',serial,bundle]).catch(()=>{});}server?.stop(true);rmSync(temp,{recursive:true,force:true});writeFileSync(join(evidence,'requests-and-cleanup.json'),JSON.stringify({requests,serverStopped:true,testPrivateKeyRemoved:true,productionTrustChanged:false},null,2));writeFileSync(join(evidence,'commands.log'),log);
}
