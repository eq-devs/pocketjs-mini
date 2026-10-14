import assert from 'node:assert/strict';
import {cpSync,mkdirSync,mkdtempSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {writeInstalledProject} from '../bin/installed-project.ts';

const root=resolve(import.meta.dir,'..'),serial=Bun.argv[2];
assert.ok(serial&&/^[a-fA-F0-9-]{36}$/.test(serial),'Pass a booted iOS simulator UUID');
const temp=mkdtempSync(join(tmpdir(),'pjm-package-matrix-ios-')),native=join(temp,'host'),bundle='dev.pjm.package.matrix.a'+Date.now();
const evidence=resolve(process.env.PJM_PACKAGE_LOAD_EVIDENCE??join(root,'build/ios-validation/package-load-'+Date.now()));mkdirSync(evidence,{recursive:true});
let launched=false,log='';
const tlsURL=process.env.PJM_DOWNLOAD_TLS_URL,tlsCertificate=process.env.PJM_DOWNLOAD_TLS_CERT;
if(tlsURL || tlsCertificate){assert.ok(tlsURL && /^https:\/\/127\.0\.0\.1:[0-9]{1,5}$/.test(tlsURL) && tlsCertificate,'TLS fixture requires owned loopback URL and public DER certificate');assert.ok(Number(new URL(tlsURL).port)<=65535);}
async function run(args:string[],env=process.env){const child=Bun.spawn(args,{env,stdout:'pipe',stderr:'pipe'});const timer=setTimeout(()=>child.kill('SIGTERM'),300000);try{const [status,out,err]=await Promise.all([child.exited,new Response(child.stdout).text(),new Response(child.stderr).text()]);log+=args.join(' ')+'\n'+out+err+'\n';if(args[0]==='xcodebuild')writeFileSync(join(evidence,'xcode.log'),out+'\n'+err);assert.equal(status,0,args[0]+': '+err+'\n'+out);return out;}finally{clearTimeout(timer);}}
try{
 await run([process.execPath,join(root,'tests/package-load-fixtures.ts'),join(temp,'cases.json')],{...process.env,PJM_PACKAGE_TARGET:'ios',PJM_PACKAGE_REAL:'',PJM_PACKAGE_HTTP_TEST:'',PJM_PACKAGE_LOCATION_SDK_TEST:''});
 const cases=JSON.parse(readFileSync(join(temp,'cases.json'),'utf8'));const item=cases[0];cpSync(join(temp,'cases.json'),join(evidence,'cases.json'));
 for(const [name,data] of [['main.pocket',Buffer.from(item.payload,'base64')],['manifest.json',JSON.stringify(item.manifest)],['publisher.key',Buffer.from(item.key,'base64')]] as const)writeFileSync(join(temp,name),data);
 writeInstalledProject({directory:native,bundle,library:join(root,'core-ffi/target/aarch64-apple-ios-sim/release/libmini_core_ffi.a'),payload:join(temp,'main.pocket'),envelope:join(temp,'manifest.json'),publicKey:join(temp,'publisher.key')});
 cpSync(join(root,'tests/PackageMatrixApp.m'),join(native,'main.m'));cpSync(join(root,'tests/PackageMatrixTests.swift'),join(native,'Tests.swift'));cpSync(join(root,'tests/package-load-ios.m'),join(native,'package-load-fixture.m'));cpSync(join(root,'tests/package-download-ios.m'),join(native,'package-download-fixture.m'));cpSync(join(temp,'cases.json'),join(native,'cases.json'));
 if(tlsURL){cpSync(join(root,'tests/package-download-tls-ios.m'),join(native,'package-download-tls-fixture.m'));writeFileSync(join(native,'tls-url.txt'),tlsURL);cpSync(tlsCertificate!,join(native,'tls-cert.der'));}
 const project=join(native,'Mini.xcodeproj/project.pbxproj');let source=readFileSync(project,'utf8');source=source.replace('objects = {','objects = {\n PJMCASESFILE = {isa = PBXFileReference; lastKnownFileType = text.json; path = cases.json; sourceTree = "<group>"; };\n PJMCASESBUILD = {isa = PBXBuildFile; fileRef = PJMCASESFILE; };');assert.ok(source.includes('files = (A081, A083, A085, A087);'));source=source.replace('files = (A081, A083, A085, A087);','files = (A081, A083, A085, A087, PJMCASESBUILD);');if(tlsURL){source=source.replace('objects = {','objects = {\n PJMTLSURL = {isa = PBXFileReference; lastKnownFileType = file; path = \"tls-url.txt\"; sourceTree = \"<group>\"; }; PJMTLSURLBUILD = {isa = PBXBuildFile; fileRef = PJMTLSURL; };\n PJMTLSCERT = {isa = PBXFileReference; lastKnownFileType = file; path = \"tls-cert.der\"; sourceTree = \"<group>\"; }; PJMTLSCERTBUILD = {isa = PBXBuildFile; fileRef = PJMTLSCERT; };').replace('PJMCASESBUILD);','PJMCASESBUILD, PJMTLSURLBUILD, PJMTLSCERTBUILD);').replace('\"-framework\", UIKit','\"-framework\", Security, \"-framework\", UIKit');}
 writeFileSync(project,source);writeFileSync(join(native,'Config.h'),readFileSync(join(native,'Config.h'),'utf8')+'\n#define PJM_DOWNLOAD_TLS_TEST '+(tlsURL?'1':'0')+'\n');
 const config=join(native,'TestConfig.swift');writeFileSync(config,readFileSync(config,'utf8')+'\nlet pjmPackageActualTLS = '+!!tlsURL+'\nlet pjmPackageCaseCount = '+cases.length+'\nlet pjmPackageCaseNames = '+JSON.stringify(cases.map((item:any)=>item.name))+'\n');launched=true;
 await run(['xcodebuild','-quiet','-project',join(native,'Mini.xcodeproj'),'-scheme','Mini','-configuration','Release','-destination','platform=iOS Simulator,id='+serial,'-derivedDataPath',join(native,'DerivedData'),'-parallel-testing-enabled','NO','-resultBundlePath',join(evidence,'Tests.xcresult'),'CODE_SIGNING_ALLOWED=NO','test']);
 await run(['xcrun','xcresulttool','export','attachments','--path',join(evidence,'Tests.xcresult'),'--output-path',join(evidence,'attachments')]);
 writeFileSync(join(evidence,'summary.json'),await run(['xcrun','xcresulttool','get','test-results','summary','--path',join(evidence,'Tests.xcresult')]));
 for(const name of ['main.pocket','manifest.json','publisher.key'])cpSync(join(temp,name),join(evidence,name));
 writeFileSync(join(evidence,'result.json'),JSON.stringify({platform:'ios',nativeRuntime:'UIKit simulator',cases:cases.length,accepted:1,rejected:cases.length-1,runtimeAttacksExecuted:2,healthyGenerationRetainedAfterAttacks:true,failedEffectsNotDelivered:true,productionVerifier:true,productionStore:true,retainedContainerExecuted:true,nativePackageDownloadControlled:true,actualTlsDownload:!!tlsURL,physicalMemoryAcceptance:false},null,2));
 console.log('Native UIKit signed-package attack matrix and retained-container isolation passed.');
}finally{
 if(launched){await run(['xcrun','simctl','terminate',serial,bundle]).catch(()=>{});await run(['xcrun','simctl','uninstall',serial,bundle]).catch(()=>{});}
 writeFileSync(join(evidence,'commands.log'),log);rmSync(temp,{recursive:true,force:true});
}
