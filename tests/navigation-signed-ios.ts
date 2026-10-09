import {cpSync,mkdirSync,mkdtempSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import assert from 'node:assert/strict';
import {writeInstalledProject} from '../bin/installed-project.ts';
import {signedNavigationFixture} from './navigation-signed-fixture.ts';

const root=resolve(import.meta.dir,'..'),serial=Bun.argv[2];
if(!serial)throw Error('Usage: bun tests/navigation-signed-ios.ts <booted simulator UUID>');
const temp=mkdtempSync(join(tmpdir(),'pjm-signed-navigation-ios-')),native=join(temp,'host');
const bundle='dev.pjm.navigation.signed.a'+Date.now();
const evidence=resolve(process.env.PJM_NAVIGATION_EVIDENCE??join(root,'build/ios-validation/signed-navigation-'+Date.now()));mkdirSync(evidence,{recursive:true});
let launched=false;
async function run(args:string[]){const child=Bun.spawn(args,{stdout:'pipe',stderr:'pipe'});const timer=setTimeout(()=>child.kill('SIGTERM'),300000);try{const [status,out,err]=await Promise.all([child.exited,new Response(child.stdout).text(),new Response(child.stderr).text()]);if(args[0]==='xcodebuild')writeFileSync(join(evidence,'xcode.log'),out+'\n'+err);assert.equal(status,0,args[0]+': '+err+'\n'+out);return out;}finally{clearTimeout(timer);}}
try{
 const fixture=await signedNavigationFixture(temp,'ios',402,778,3);
 writeInstalledProject({directory:native,bundle,library:join(root,'core-ffi/target/aarch64-apple-ios-sim/release/libmini_core_ffi.a'),...fixture});
 cpSync(join(root,'tests/NavigationSignedObserver.h'),join(native,'NavigationSignedObserver.h'));
 const mainPath=join(native,'main.m'),main=readFileSync(mainPath,'utf8'),marker='[[MiniInstalledController alloc] initWithIdentity:';
 assert.equal(main.split(marker).length,2);writeFileSync(mainPath,(['provider','overflow','late'].includes(process.env.PJM_MEDIA_UI_CASE??'')?'#define PJM_MEDIA_PROVIDER_TEST 1\n'+(process.env.PJM_MEDIA_UI_CASE==='overflow'?'#define PJM_MEDIA_OVERFLOW_TEST 1\n':process.env.PJM_MEDIA_UI_CASE==='late'?'#define PJM_MEDIA_LATE_TEST 1\n':''):'')+'#import "NavigationSignedObserver.h"\n'+main.replace(marker,'[[NavigationProofController alloc] initWithIdentity:'));
 cpSync(join(root,'tests/SignedNavigationTests.swift'),join(native,'Tests.swift'));
 const points=fixture.points;
 writeFileSync(join(native,'TestConfig.swift'),`let pjmMediaUiCase = ${JSON.stringify(process.env.PJM_MEDIA_UI_CASE??"")}\nlet pjmNavigationWidth: Double = ${points.width}\nlet pjmNavigationHeight: Double = ${points.height}\nlet pjmNavigationPoints: [[Double]] = ${JSON.stringify([points.increment,points.detail,points.back])}\n`);
 launched=true;
 await run(['xcodebuild','-quiet','-project',join(native,'Mini.xcodeproj'),'-scheme','Mini','-configuration','Release','-destination','platform=iOS Simulator,id='+serial,'-derivedDataPath',join(native,'DerivedData'),'-parallel-testing-enabled','NO','-resultBundlePath',join(evidence,'Tests.xcresult'),'CODE_SIGNING_ALLOWED=NO','test']);
 await run(['xcrun','xcresulttool','export','attachments','--path',join(evidence,'Tests.xcresult'),'--output-path',join(evidence,'attachments')]);
 writeFileSync(join(evidence,'summary.json'),await run(['xcrun','xcresulttool','get','test-results','summary','--path',join(evidence,'Tests.xcresult')]));
 for(const name of ['main.pocket','manifest.json','publisher.key','input-points.json'])cpSync(join(temp,name),join(evidence,name));
 writeFileSync(join(evidence,'result.json'),JSON.stringify({signedPackage:true,productionInstalledHost:true,testOnlyStorageObserver:true,realTsx:true,nativeNetworkSnapshot:true,mediaUiCase:process.env.PJM_MEDIA_UI_CASE??null,testOnlyMediaSource:process.env.PJM_MEDIA_UI_CASE==="provider",nativeProviderJpegReadRelease:process.env.PJM_MEDIA_UI_CASE==="provider",untrustedDevelopmentUrlIgnored:true,buttonNavigation:true,queryRetained:true,counterRetained:true,backgroundResume:true,coldReset:true,physicalAcceptance:false},null,2));
 console.log('Signed UIKit TSX navigation passed: offline authenticated package, ignored untrusted development URL, route/query/counter retention, background/resume and cold reset.');
}finally{if(launched){await run(['xcrun','simctl','terminate',serial,bundle]).catch(()=>{});await run(['xcrun','simctl','uninstall',serial,bundle]).catch(()=>{});}rmSync(temp,{recursive:true,force:true});}
